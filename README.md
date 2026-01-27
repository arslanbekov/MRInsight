# MRInsight

AI-powered MRI DICOM scan analysis using Claude.

<details>
  <summary>Screenshots</summary>
<img width="700" alt="2" src="https://github.com/user-attachments/assets/ce840d5c-93ba-42d8-888e-5aaa335dc607" />
<img width="700" alt="3" src="https://github.com/user-attachments/assets/7afcd3c8-7d5c-4889-b036-55832421e6d2" />
<img width="700" alt="4" src="https://github.com/user-attachments/assets/b40f8889-9169-415a-be07-5d870dc20e5a" />
<img width="700" alt="5" src="https://github.com/user-attachments/assets/2ca7ec8d-ef4d-4148-89b7-8e4833170c5a" />
</details>

## Features

- **DICOM file loading** - from local folder or drag & drop
- **AI-assisted series selection** - describe what you want to examine ("spine", "brain") and AI selects relevant series
- **Multi-series selection** - manually select multiple series
- **Auto-filtering** - localizer/scout images are automatically filtered
- **Slice navigation** - mouse wheel, arrow keys, slider
- **Analysis modes**:
  - Overview (~10 slices) - quick overview
  - Current - current slice only
  - Selected - manually selected slices
  - All - all loaded slices
- **AI annotations** - markers on images where AI found findings
- **Contextual chat** - continue conversation with AI about the scans

## Architecture

```
mri/
├── backend/                 # Python FastAPI
│   ├── main.py             # API endpoints
│   ├── dicom_utils.py      # DICOM parsing
│   ├── claude_client.py    # Claude API
│   └── requirements.txt
├── frontend/               # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── AuthScreen.tsx      # Token input
│   │   │   ├── DicomViewer.tsx     # DICOM viewer
│   │   │   ├── ChatPanel.tsx       # AI chat
│   │   │   └── UploadZone.tsx      # File upload
│   │   ├── hooks/
│   │   │   ├── useApi.ts
│   │   │   └── useStore.ts
│   │   └── types/
│   └── package.json
└── uploads/                # Temporary storage
```

## Requirements

- Python 3.11+
- Node.js 18+
- Claude API key (`sk-ant-api03-*`)

## Installation

### Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate (macOS/Linux)
source venv/bin/activate

# Activate (Windows)
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install
```

## Running

### Option 1: Quick start script

```bash
./start.sh
```

### Option 2: Using Make

```bash
make install  # First time only
make dev      # Start both servers
```

### Option 3: Manual start (for development)

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173

## Usage

1. **Enter API token** - Claude API key (starts with `sk-ant-api03-`)

2. **Load DICOM files**:
   - Click "Load from local folder" and enter path to DICOM folder
   - Or drag & drop files into the upload zone

3. **Select series**:
   - **AI selection**: enter what you want to examine (e.g., "spine and lower back")
   - **Manual selection**: click on series checkboxes
   - **Load All**: load all non-localizer series

4. **Navigation**:
   - Mouse wheel / arrow keys - switch slices
   - Space - select slice for analysis
   - Slider - quick navigation

5. **Analysis**:
   - Select mode: Overview / Current / Selected / All
   - Enter question or use Quick Actions
   - AI will show findings with markers on images

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/model-info` | GET | AI model information |
| `/api/validate-token` | POST | Validate API token |
| `/api/scan-folder` | POST | Scan DICOM folder |
| `/api/load-series/{id}` | POST | Load series |
| `/api/load-multiple-series/{id}` | POST | Load multiple series |
| `/api/ai-select-series/{id}` | POST | AI-assisted series selection |
| `/api/upload` | POST | Upload files |
| `/api/scan/{id}` | GET | Get scan data |
| `/api/analyze` | POST | Analyze with Claude |
| `/api/chat` | POST | Continue chat |

## Technologies

### Backend
- **FastAPI** - async API server
- **pydicom** - DICOM parsing
- **Pillow + numpy** - image processing
- **anthropic** - Claude API SDK

### Frontend
- **React 18 + TypeScript**
- **Vite** - build tool
- **TailwindCSS** - styling
- **Zustand** - state management
- **react-dropzone** - file upload
- **react-markdown** - AI response rendering

## AI Model

Uses **Claude Sonnet 4** (`claude-sonnet-4-20250514`).

The system prompt is configured for:
- Structural anomaly analysis
- Unusual signal detection
- Mass effect identification
- Atrophy detection
- Returning finding coordinates for marker display

## Security

- API token stored only in sessionStorage (not localStorage)
- Token passed in header with each request
- Files deleted after session
- Backend does not store tokens

## Troubleshooting

### Python SSL errors (macOS with pyenv)

If pyenv Python has SSL issues:
```bash
# Use Homebrew Python
/opt/homebrew/bin/python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### CORS errors

Frontend must run on `localhost:5173` (configured in CORS).

### "Invalid API token"

Make sure token starts with `sk-ant-api03-` (not `sk-ant-sid` or others).

## Disclaimer

AI analysis is for educational and informational purposes only.
This is NOT a medical diagnosis. Always consult a qualified radiologist for professional interpretation.
