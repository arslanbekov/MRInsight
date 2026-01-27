.PHONY: install install-backend install-frontend dev backend frontend build clean

# Install all dependencies
install: install-backend install-frontend

install-backend:
	cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

# Development (run both servers)
dev:
	./start.sh

# Run backend only
backend:
	cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000

# Run frontend only
frontend:
	cd frontend && npm run dev

# Build frontend for production
build:
	cd frontend && npm run build

# Clean build artifacts
clean:
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf backend/venv
	rm -rf backend/__pycache__
	rm -rf uploads/*

# Type check frontend
typecheck:
	cd frontend && npm run build

# Help
help:
	@echo "MRInsight - Available commands:"
	@echo ""
	@echo "  make install    - Install all dependencies"
	@echo "  make dev        - Run both backend and frontend"
	@echo "  make backend    - Run backend only (port 8000)"
	@echo "  make frontend   - Run frontend only (port 5173)"
	@echo "  make build      - Build frontend for production"
	@echo "  make clean      - Remove all build artifacts"
	@echo "  make typecheck  - Type check frontend"
