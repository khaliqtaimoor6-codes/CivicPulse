FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
	fastapi~=0.115.0 \
	"uvicorn[standard]~=0.30.0" \
	sqlalchemy~=2.0.0 \
	alembic~=1.13.0 \
	psycopg2-binary~=2.9.0 \
	"pydantic>=2,<3" \
	pydantic-settings~=2.6.0 \
	python-dotenv~=1.0.0 \
	"groq~=1.7.0" \
	"redis~=5.2.0" \
	"prometheus-client~=0.21.0"

COPY app ./app
COPY scripts ./scripts
COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
