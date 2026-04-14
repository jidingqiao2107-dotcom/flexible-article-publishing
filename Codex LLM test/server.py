from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request

ROOT_DIR = Path(__file__).resolve().parent
STATIC_DIR = ROOT_DIR / "static"
OPENAI_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.4"
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant for a small browser chat app."
ALLOWED_ROLES = {"user", "assistant", "developer", "system"}
ALLOWED_REASONING_EFFORTS = {"none", "low", "medium", "high", "xhigh"}


def current_settings() -> dict[str, str | None]:
    reasoning_effort = os.getenv("OPENAI_REASONING_EFFORT", "").strip().lower()
    if reasoning_effort not in ALLOWED_REASONING_EFFORTS:
        reasoning_effort = ""

    return {
        "api_key": os.getenv("OPENAI_API_KEY", "").strip() or None,
        "model": os.getenv("OPENAI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        "system_prompt": os.getenv("OPENAI_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT).strip()
        or DEFAULT_SYSTEM_PROMPT,
        "reasoning_effort": reasoning_effort or None,
    }


def normalize_messages(raw_messages: object) -> list[dict[str, str]]:
    if not isinstance(raw_messages, list):
        raise ValueError("`messages` must be a list.")

    messages: list[dict[str, str]] = []

    for item in raw_messages[-20:]:
        if not isinstance(item, dict):
            continue

        role = str(item.get("role", "")).strip().lower()
        content = str(item.get("content", "")).strip()

        if role not in ALLOWED_ROLES or not content:
            continue

        messages.append({"role": role, "content": content})

    if not messages:
        raise ValueError("Please send at least one non-empty chat message.")

    return messages


def build_openai_payload(
    messages: list[dict[str, str]], settings: dict[str, str | None]
) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": settings["model"],
        "instructions": settings["system_prompt"],
        "input": [{"role": msg["role"], "content": msg["content"]} for msg in messages],
    }

    if settings["reasoning_effort"]:
        payload["reasoning"] = {"effort": settings["reasoning_effort"]}

    return payload


def extract_output_text(response_json: dict[str, object]) -> str:
    output_text = response_json.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    collected_parts: list[str] = []

    output_items = response_json.get("output")
    if isinstance(output_items, list):
        for item in output_items:
            if not isinstance(item, dict):
                continue
            content_items = item.get("content")
            if not isinstance(content_items, list):
                continue
            for content_item in content_items:
                if not isinstance(content_item, dict):
                    continue
                text = content_item.get("text")
                if isinstance(text, str) and text.strip():
                    collected_parts.append(text.strip())

    return "\n\n".join(collected_parts).strip()


def call_openai(messages: list[dict[str, str]]) -> dict[str, object]:
    settings = current_settings()
    api_key = settings["api_key"]

    if not api_key:
        raise RuntimeError(
            "Set OPENAI_API_KEY before starting the server so the chatbox can reach OpenAI."
        )

    payload = build_openai_payload(messages, settings)
    request_body = json.dumps(payload).encode("utf-8")

    req = request.Request(
        OPENAI_API_URL,
        data=request_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with request.urlopen(req, timeout=90) as response:
        data = response.read().decode("utf-8")
        return json.loads(data)


class ChatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        if self.path == "/api/config":
            settings = current_settings()
            self._send_json(
                200,
                {
                    "apiKeyConfigured": bool(settings["api_key"]),
                    "model": settings["model"],
                    "reasoningEffort": settings["reasoning_effort"],
                },
            )
            return

        if self.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/chat":
            self._send_json(404, {"error": "Not found."})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8") or "{}")
            if not isinstance(payload, dict):
                raise ValueError("Request body must be a JSON object.")
            messages = normalize_messages(payload.get("messages"))
            response_json = call_openai(messages)
            reply = extract_output_text(response_json)

            if not reply:
                reply = "The model returned a response, but no text output was found."

            self._send_json(
                200,
                {"reply": reply, "model": current_settings()["model"]},
            )
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Request body must be valid JSON."})
        except ValueError as exc:
            self._send_json(400, {"error": str(exc)})
        except RuntimeError as exc:
            self._send_json(500, {"error": str(exc)})
        except error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            message = details
            try:
                parsed = json.loads(details)
                message = parsed.get("error", {}).get("message", details)
            except json.JSONDecodeError:
                pass

            self._send_json(
                exc.code,
                {"error": f"OpenAI API request failed: {message}"},
            )
        except error.URLError as exc:
            self._send_json(
                502,
                {"error": f"Could not reach the OpenAI API: {exc.reason}"},
            )
        except Exception as exc:  # pragma: no cover - last-resort protection for the demo app
            self._send_json(500, {"error": f"Unexpected server error: {exc}"})

    def _send_json(self, status_code: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), ChatHandler)

    print(f"Serving GPT chatbox on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
