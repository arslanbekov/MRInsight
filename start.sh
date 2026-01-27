#!/bin/bash

# MRInsight - Quick Start Script

set -e

echo "MRInsight - MRI DICOM Analyzer"
echo "=============================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if backend venv exists
if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    cd "$SCRIPT_DIR/backend"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    echo -e "${GREEN}Backend dependencies installed${NC}"
else
    echo -e "${GREEN}Backend venv found${NC}"
fi

# Check if frontend node_modules exists
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd "$SCRIPT_DIR/frontend"
    npm install
    echo -e "${GREEN}Frontend dependencies installed${NC}"
else
    echo -e "${GREEN}Frontend node_modules found${NC}"
fi

# Start backend
echo ""
echo -e "${YELLOW}Starting backend on http://localhost:8000...${NC}"
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
uvicorn main:app --port 8000 &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start frontend
echo -e "${YELLOW}Starting frontend on http://localhost:5173...${NC}"
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}MRInsight is running${NC}"
echo -e "${GREEN}Open: http://localhost:5173${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Press Ctrl+C to stop both servers"

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping servers...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}Done${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
