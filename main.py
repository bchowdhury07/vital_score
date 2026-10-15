"""
Root entrypoint to run the VitalScore FastAPI backend server.
Allows starting the server simply with:
    python main.py
"""

import sys
import uvicorn

if __name__ == "__main__":
    print("Starting VitalScore Backend API at http://127.0.0.1:8000 ...")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
