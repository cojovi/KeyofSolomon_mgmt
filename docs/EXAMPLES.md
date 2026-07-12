# Practical Examples

All examples assume:

```bash
BASE=http://localhost:8787/api/v1
TOKEN=$(grep LOCAL_API_TOKEN .env | cut -d= -f2)
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"
```

---

## Core CRUD

### Create a task

```bash
curl -s -X POST $BASE/tasks -H "$AUTH" -H "$CT" -d '{
  "title": "Replace flaky PoE injector",
  "description": "Port 7 keeps dropping the garage AP.",
  "area": "home", "priority": "high", "dueDate": "2026-06-20",
  "tags": ["network","hardware"], "agentCandidate": false
}'
```

### Create a project

```bash
curl -s -X POST $BASE/projects -H "$AUTH" -H "$CT" -d '{
  "title": "Shop dust collection",
  "shortDescription": "Cyclone + automated blast gates",
  "category": "home", "status": "planning", "priority": "medium",
  "progressPercent": 0, "tags": ["workshop","automation"]
}'
```

### Add an idea (quick capture)

```bash
curl -s -X POST $BASE/ideas -H "$AUTH" -H "$CT" \
  -d '{"title":"Print neon sign mounts for the dashboard screen","category":"3d-printing"}'
```

### Convert an idea to a task

```bash
IDEA=idea_xxxxxxxxxxxxxxxx
curl -s -X POST $BASE/ideas/$IDEA/convert-to-task -H "$AUTH" -H "$CT" \
  -d '{"priority":"medium","dueDate":"2026-07-01"}'
```

### Convert an idea to a project

```bash
curl -s -X POST $BASE/ideas/$IDEA/convert-to-project -H "$AUTH" -H "$CT" \
  -d '{"priority":"high"}'
```

### Add a note to a task

```bash
TASK=task_xxxxxxxxxxxxxxxx
curl -s -X POST $BASE/tasks/$TASK/notes -H "$AUTH" -H "$CT" \
  -d '{"body":"Ordered replacement, ETA Friday.","type":"progress"}'
```

### Mark a task done

```bash
curl -s -X POST $BASE/tasks/$TASK/complete -H "$AUTH"
```

### Get dashboard state

```bash
curl -s $BASE/dashboard/state -H "$AUTH" | jq '.data.summary'
# { "activeProjects": 2, "openTasks": 9, "blockedItems": 3, "ideas": 5 }
```

### Search and filter

```bash
curl -s -G $BASE/tasks -H "$AUTH" --data-urlencode "q=network" \
  --data-urlencode "status=todo" --data-urlencode "priority=high"
curl -s -G $BASE/notes -H "$AUTH" -d createdBy=agent -d limit=20
```

---

## Fast Capture *(Beta 2)*

```bash
# Let AI classify
curl -s -X POST $BASE/capture -H "$AUTH" -H "$CT" \
  -d '{"text":"Buy dog food on the way home"}'
# → {"classified":true,"type":"task","confidence":0.94,"created":{…}}

# Override type manually
curl -s -X POST $BASE/capture -H "$AUTH" -H "$CT" \
  -d '{"text":"Subscription tier for mini-homes","type":"idea"}'
```

---

## AI Summaries *(Beta 2)*

```bash
# Check configured provider
curl -s $BASE/ai/config -H "$AUTH" | jq '.data'

# Generate a summary
curl -s -X POST $BASE/ai/summaries/today_focus -H "$AUTH" | jq '.data.content'
curl -s -X POST $BASE/ai/summaries/whats_blocked -H "$AUTH" | jq '.data.content'
curl -s -X POST $BASE/ai/summaries/agent_suggest -H "$AUTH" | jq '.data.content'

# List stored summaries
curl -s $BASE/ai/summaries -H "$AUTH" | jq '[.data[] | {type, provider, generatedAt}]'
```

---

## Approvals *(Beta 2)*

```bash
# List pending approvals
curl -s $BASE/approvals/pending -H "$AUTH" | jq 'length'

# Approve
APPR=appr_xxxxxxxxxxxxxxxx
curl -s -X POST $BASE/approvals/$APPR/approve -H "$AUTH"

# Reject
curl -s -X POST $BASE/approvals/$APPR/reject -H "$AUTH"
```

---

## Agent examples (X-Agent-Name header)

```bash
AG="X-Agent-Name: OpenClaw"
```

### Morning briefing

```bash
curl -s $BASE/agent/context/today -H "$AUTH" -H "$AG" \
  | jq '{overdue: (.data.overdue|length), candidates: (.data.agentCandidates|length)}'
```

### Agent creates a task

```bash
curl -s -X POST $BASE/agent/tasks/create -H "$AUTH" -H "$CT" -H "$AG" -d '{
  "title": "Rotate weather API key",
  "priority": "medium", "agentCandidate": true,
  "reason": "Detected 401s in Home Assistant logs"
}'
```

### Agent creates a main task with subtasks

```bash
MAIN=$(curl -s -X POST $BASE/agent/tasks/create -H "$AUTH" -H "$CT" -H "$AG" -d '{
  "title": "Schedule the TRT appointment",
  "area": "health",
  "reason": "User asked for one tracked appointment outcome"
}' | jq -r '.data.task.id')

curl -s -X POST $BASE/agent/tasks/$MAIN/create-subtasks -H "$AUTH" -H "$CT" -H "$AG" -d '{
  "subtasks": [
    {"title":"Find the recommended TRT provider","priority":"high"},
    {"title":"Confirm availability and new-patient acceptance"},
    {"title":"Book the appointment"}
  ],
  "reason": "Initial execution plan for scheduling the appointment"
}'
```

If a genuinely new requirement appears later, extend the plan explicitly:

```bash
curl -s -X POST $BASE/agent/tasks/$MAIN/create-subtasks -H "$AUTH" -H "$CT" -H "$AG" -d '{
  "subtasks": [{"title":"Confirm insurance coverage"}],
  "extendExistingPlan": true,
  "reason": "Insurance verification became a required booking step"
}'
```

To link an existing task instead of creating a new one:

```bash
curl -s -X POST $BASE/agent/tasks/$TASK/set-parent -H "$AUTH" -H "$CT" -H "$AG" \
  -d '{"parentTaskId":"'"$MAIN"'","reason":"This task is part of the same outcome"}'
```

### Agent updates status (reason required!)

```bash
curl -s -X POST $BASE/agent/tasks/$TASK/update-status -H "$AUTH" -H "$CT" -H "$AG" \
  -d '{"status":"in_progress","reason":"Starting work as instructed"}'
```

### Agent adds a progress note

```bash
curl -s -X POST $BASE/agent/tasks/$TASK/add-note -H "$AUTH" -H "$CT" -H "$AG" \
  -d '{"body":"Key rotated and verified, watching logs for an hour.","type":"progress"}'
```

### Agent converts idea to project (with approval flow)

```bash
# Step 1 — request approval
curl -s -X POST $BASE/approvals -H "$AUTH" -H "$CT" -H "$AG" -d '{
  "agentName": "OpenClaw",
  "actionType": "convert_idea_to_project",
  "targetType": "idea",
  "targetId": "'$IDEA'",
  "payload": {"priority":"high"},
  "reason": "User said this idea is ready to become a full project."
}'
# → {id: "appr_…", status: "pending"}

# Step 2 — poll until resolved
curl -s $BASE/approvals/$APPR -H "$AUTH" | jq '.data.status'

# Step 3 — if "approved", convert
curl -s -X POST $BASE/agent/ideas/$IDEA/convert-to-project -H "$AUTH" -H "$CT" -H "$AG" \
  -d '{"reason":"Approved by user via Agent Center","priority":"high"}'
```

### Log an agent action explicitly

```bash
curl -s -X POST $BASE/agent/actions/log -H "$AUTH" -H "$CT" -H "$AG" -d '{
  "actionType": "update", "targetType": "task", "targetId": "'$TASK'",
  "summary": "Verified fix in production logs",
  "details": "No 401s in the last 60 minutes."
}'
```

### Watch the live event stream

```bash
curl -N "$BASE/events?token=$TOKEN"
# event: connected …
# event: data-changed
# data: {"entity":"task","id":"task_…","op":"update","at":"…"}
# event: approval_requested
# data: {"id":"appr_…","agentName":"OpenClaw","actionType":"mark_done"}
```

### Webhook — push from an external tool

```bash
curl -s -X POST $BASE/webhooks/task -H "$AUTH" -H "$CT" \
  -d '{"title":"Call insurance company","priority":"high","source":"ios-shortcut"}'

curl -s -X POST $BASE/webhooks/agent-update -H "$AUTH" -H "$CT" \
  -d '{"agentName":"OpenClaw","summary":"Daily review complete","details":"3 tasks updated."}'
```
