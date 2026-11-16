"""Dev launcher that forces selector loop on Windows.

Creates the loop explicitly and hands it to uvicorn so the server and all
psycopg async connections run on SelectorEventLoop.
"""
from __future__ import annotations

import asyncio
import sys


def main() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        # Force a new SelectorEventLoop now so anything touching asyncio.get_event_loop()
        # later in this process sees the right kind.
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        print(f"[run_dev] forced loop: {type(loop).__name__}", flush=True)

    import uvicorn

    config = uvicorn.Config(
        app="app.main:app",
        host="127.0.0.1",
        port=8001,
        loop="asyncio",
        reload=False,
    )
    server = uvicorn.Server(config)
    # Drive the server on the explicitly-selected loop instead of letting uvicorn pick.
    loop = asyncio.get_event_loop()
    loop.run_until_complete(server.serve())


if __name__ == "__main__":
    main()
