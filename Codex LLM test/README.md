# GPT-5.4 Chatbox Demo

This is a tiny local web app: a simple chatbox in the browser with OpenAI's `gpt-5.4` behind it.

It uses Python's standard library for the server and OpenAI's Responses API for the model call, so there are no package installs required.

## What it does

- Serves a small browser chat UI
- Sends the running conversation to OpenAI
- Uses `gpt-5.4` by default
- Lets you switch models with an environment variable if you want a cheaper/faster option like `gpt-5.4-mini`

## Run it

In PowerShell:

```powershell
$env:OPENAI_API_KEY="your_api_key_here"
python .\server.py
```

You can create or copy your key in the OpenAI dashboard here:

- [OpenAI API keys](https://platform.openai.com/api-keys)

Then open:

[http://127.0.0.1:8000](http://127.0.0.1:8000)

## Optional settings

```powershell
$env:OPENAI_MODEL="gpt-5.4-mini"
$env:OPENAI_REASONING_EFFORT="low"
$env:OPENAI_SYSTEM_PROMPT="You are a concise coding assistant."
python .\server.py
```

## Files

- [server.py](D:\Codex LLM test\server.py)
- [static/index.html](D:\Codex LLM test\static\index.html)
- [static/app.js](D:\Codex LLM test\static\app.js)
- [static/styles.css](D:\Codex LLM test\static\styles.css)

## Notes

- The app expects a valid `OPENAI_API_KEY` in the shell before startup.
- Keep that key on the server side only. Do not expose it in browser-side JavaScript or commit it into the repo.
- The frontend keeps chat history in memory for the current page session.
- This is a demo app, so it does not persist users, chats, or secrets.

## Docs used

- OpenAI recommends the Responses API for new text generation apps: [Text generation](https://platform.openai.com/docs/guides/text?api-mode=responses)
- `gpt-5.4` is a current model ID in the OpenAI model docs: [GPT-5.4 model](https://developers.openai.com/api/docs/models/gpt-5.4)
- OpenAI's current model guide also says to start with `gpt-5.4` for complex reasoning and coding: [Models overview](https://developers.openai.com/api/docs/models)
