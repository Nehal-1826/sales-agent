"""Local Windows dev launcher for the API.

On Windows, uvicorn defaults to the ProactorEventLoop, which async psycopg
cannot use. uvicorn.run() ignores a pre-set policy, so we create a
SelectorEventLoop ourselves and run the server on it. Prod runs on Linux and
never hits this — local-only helper.
"""
import asyncio
import sys

import uvicorn

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    config = uvicorn.Config("app.main:app", host="127.0.0.1", port=8001, loop="asyncio")
    server = uvicorn.Server(config)

    loop = asyncio.new_event_loop()  # SelectorEventLoop per the policy above
    asyncio.set_event_loop(loop)
    loop.run_until_complete(server.serve())
