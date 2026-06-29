# One-shot deploy of the ScribeShift generation worker to Google Cloud Run.
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File .\deploy-worker.ps1
# Safe to re-run. Reads the 4 keys straight from .env (nothing to paste).

$PROJECT = 'scribeshift'
$REGION  = 'africa-south1'
$SA      = '408204525933-compute@developer.gserviceaccount.com'

Write-Host "==> Setting project to $PROJECT ..." -ForegroundColor Cyan
gcloud config set project $PROJECT

Write-Host "==> Granting build permissions (idempotent) ..." -ForegroundColor Cyan
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/cloudbuild.builds.builder"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/storage.objectViewer"

Write-Host "==> Reading keys from .env ..." -ForegroundColor Cyan
if (-not (Test-Path .env)) { Write-Host "ERROR: .env not found. Run this from the project folder." -ForegroundColor Red; exit 1 }
$pairs = Get-Content .env |
  Where-Object { $_ -match '^\s*(SUPABASE_URL|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|GEMINI_API_KEY)=' } |
  ForEach-Object { ($_ -replace '"', '').Trim() }
if ($pairs.Count -lt 4) { Write-Host "WARNING: only found $($pairs.Count) of 4 keys in .env" -ForegroundColor Yellow }
$envVars = ($pairs -join ',')

Write-Host "==> Deploying to Cloud Run (3-5 min) ..." -ForegroundColor Cyan
gcloud run deploy scribeshift-worker --source . --region $REGION --no-cpu-throttling --min-instances 1 --max-instances 1 --no-allow-unauthenticated --set-env-vars $envVars

Write-Host "==> Recent worker logs:" -ForegroundColor Green
gcloud run services logs read scribeshift-worker --region $REGION --limit 20
