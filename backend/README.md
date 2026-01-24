# Backend - Fall Detection API

Hướng dẫn cài đặt và chạy server backend sử dụng Python và pip.

## Yêu cầu hệ thống
- Python 3.10 trở lên
- pip (Python package manager)

## Cài đặt

### 1. Tạo môi trường ảo (Virtual Environment)
Khuyến khích sử dụng môi trường ảo để không ảnh hưởng đến các dự án khác.

```bash
python -m venv .venv
```

### 2. Kích hoạt môi trường
* **Windows:**
  ```powershell
  .\.venv\Scripts\activate
  ```
* **macOS/Linux:**
  ```bash
  source .venv/bin/activate
  ```

### 3. Cài đặt các thư viện cần thiết
Chạy lệnh sau để cài đặt các gói từ file `requirements.txt`:

```bash
pip install -r requirements.txt
```

## Chạy ứng dụng

Bạn có thể chạy server bằng lệnh sau:

```bash
python main.py
```

Hoặc sử dụng trực tiếp `uvicorn`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Sau khi chạy thành công:
- **API Server:** http://localhost:8000
- **Tài liệu API (Swagger UI):** http://localhost:8000/docs
- **WebSocket:** ws://localhost:8000/ws/predict

## Cấu trúc thư mục
- `main.py`: File chính chứa mã nguồn API và logic xử lý AI.
- `models/`: Thư mục chứa model YOLO (sẽ được tự động tải về khi chạy lần đầu).
- `requirements.txt`: Danh sách các thư viện phụ thuộc.
