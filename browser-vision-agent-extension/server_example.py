"""
Minimal demo server.

Install:
    pip install fastapi uvicorn

Run:
    uvicorn server_example:app --reload --port 8000

The extension POSTs the privacy-safe context to:
    http://localhost:8000/agent

Replace the rule-based response with your VLM/LLM later.
"""

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any

app = FastAPI()


class AgentRequest(BaseModel):
    dom: dict[str, Any]
    screenshot: str


@app.post("/agent")
def agent(req: AgentRequest):
    # Demo only:
    # Find a visible button/link that looks like "Next" or "Submit".
    candidates = req.dom.get("nodes", [])

    for node in candidates:
        text = (node.get("text") or "").lower()
        if node.get("sensitive"):
            continue

        if text in {"next", "continue", "submit"}:
            return {
                "action": {
                    "type": "click",
                    "agentId": node["agentId"]
                },
                "reason": f"Demo rule selected visible element: {text}"
            }

    return {
        "action": {
            "type": "scroll",
            "amount": 600
        },
        "reason": "Demo rule: no obvious Next/Continue/Submit element found."
    }