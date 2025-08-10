# 1. Use an appropriate official Python base image
FROM python:3.11-slim

# 2. Set a working directory
WORKDIR /app

# 3. Copy the requirements.txt file
COPY requirements.txt .

# 4. Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy the rest of the application code
COPY . .

# 6. Expose the port the application runs on
EXPOSE 8000

# 7. Define the command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]