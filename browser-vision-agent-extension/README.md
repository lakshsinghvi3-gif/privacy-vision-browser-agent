# Privacy Vision Browser Agent — Chrome MVP

This is a starting prototype for SIH26171.

## What it does

1. Captures the active Chrome tab.
2. Extracts a privacy-safe DOM representation locally.
3. Detects likely sensitive fields locally:
   - password
   - credential/token-like fields
   - card/CVV/SSN/Aadhaar/PAN-like fields
   - email/phone/address-like fields
   - sensitive autocomplete fields
4. Gets bounding boxes for sensitive elements.
5. Captures the visible tab locally.
6. Overwrites sensitive screenshot regions locally before any server request.
7. Sends the sanitized screenshot + structural DOM metadata to a server.
8. Receives a small browser-action command.
9. Validates the action type locally.
10. Executes click/scroll/focus locally.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.
5. Open a normal webpage.
6. Click the extension icon.
7. Use **Capture Context** first.
8. Use **Run Agent** to call the demo server.

## Run the demo server

```bash
pip install fastapi uvicorn
uvicorn server_example:app --reload --port 8000
```

Then reload the extension.

## Important MVP limitation

The sensitive detector is heuristic. For the SIH submission, improve it with:
- DOM semantic labels and accessibility tree signals
- NER/PII detection
- local OCR for text that exists only in pixels
- face detection
- card/ID pattern detection
- confidence scores
- overlap handling between sensitive boxes
- tests for precision/recall

## SIH architecture

Browser:
  Screen
    -> local capture
    -> local privacy detector
    -> local redaction
    -> sanitized image
                  \
                   -> server VLM/LLM
                  /
  DOM -> structural representation

Server:
  sanitized image + DOM
    -> VLM/LLM reasoning
    -> constrained action JSON

Browser:
  action JSON
    -> local validation
    -> local element lookup
    -> click / scroll / focus

Never send the original screenshot or raw input values to the server.