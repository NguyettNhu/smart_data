# DAI NAM TÀI NĂNG SÁNG TẠO CÔNG NGHỆ BẢN MÔ TẢ DỰ ÁN
**UNIVERSITY KHOA CÔNG NGHỆ THÔNG TIN “Bật ý tưởng - Chạm tương lai”**

---

## A. THÔNG TIN ĐỘI THI
**Tên đội thi:** [Điền tên đội thi]

**Danh sách thành viên:**
| STT | Họ tên | Nơi học/làm | SĐT | Email |
|:---:|:---:|:---:|:---:|:---:|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## B. THÔNG TIN DỰ ÁN
**Tên dự án (VN/EN):** Hệ thống camera giám sát và phát hiện té ngã ứng dụng AI / AI-powered Fall Detection System

**1. Vấn đề đặt ra (150-200 từ):**
Té ngã là một trong những nguyên nhân hàng đầu gây ra chấn thương nghiêm trọng và đe dọa tính mạng, đặc biệt đối với người cao tuổi, bệnh nhân tại bệnh viện hay người lao động trong môi trường rủi ro cao. Khi xảy ra sự cố té ngã, việc không được phát hiện và sơ cứu kịp thời có thể dẫn đến những hậu quả đáng tiếc. Các giải pháp truyền thống như sử dụng thiết bị đeo bằng cảm biến thường gây bất tiện, dễ bị quên hoặc hỏng hóc. Do đó, yêu cầu đặt ra là cần một hệ thống tự động theo dõi, giám sát 24/7 thông qua camera thông thường mà không cần sự can thiệp thủ công liên tục, nhằm phát hiện lập tức các tư thế bất thường (té ngã) và gửi cảnh báo ngay cho người thân hoặc lực lượng y tế.

**2. Lĩnh vực áp dụng:**
[x] AI/Machine Learning
[ ] Big Data
[x] Web/Mobile App
[x] Y tế
[x] IoT/Embedded
[ ] Chuyển đổi số
[ ] An ninh mạng
[ ] Giáo dục
[ ] Giao thông
[ ] Khác

**3. Mô tả giải pháp:**
Dự án xây dựng một hệ thống phát hiện té ngã tích hợp trực tiếp vào hệ thống camera giám sát, bao gồm:
- **Ứng dụng công nghệ Thị giác máy tính (Computer Vision):** Sử dụng mô hình học sâu **YOLOv8 Pose** để trích xuất và phân tích khung xương (keypoints) của con người qua video. 
- **Thuật toán phân tích không gian:** Phân tích độ biến thiên về tỷ lệ bao phủ cơ thể (Spread Ratio / Box Occupation), chiều định hướng nằm ngang (Horizontal Spread) ở nhiều góc quan sát (top-down, side-view) để phân loại chính xác tư thế Đứng, Đang ngã và Đã ngã.
- **Hệ thống phần mềm (Web App):** Xây dựng Backend bằng FastAPI với khả năng xử lý thời gian thực, lưu trữ qua SQLite; kết hợp Frontend bằng Next.js (React) cung cấp Dashboard quản lý tập trung, hiển thị camera live stream trực tiếp và lưu trữ hình ảnh lịch sử (Snapshots).
- **Hệ thống cảnh báo:** Tự động gửi email thông báo gồm thông tin độ tin cậy ngã, thời gian và ảnh chụp hiện trường ngay khi hệ thống AI xác định có té ngã.

**4. Đối tượng sử dụng:**
- **Người dùng chính:** Nhân viên y tế (trong bệnh viện, phòng khám), ban quản lý viện dưỡng lão, gia đình có người cao tuổi, bộ phận quản lý an toàn lao động.
- **Quy mô áp dụng:** Hộ gia đình đơn lẻ, các cơ sở y tế, viện dưỡng lão, khu vực sản xuất hoặc thi công công nghiệp quy mô nhỏ đến trung bình.

**5. Mức độ hoàn thiện:**
[ ] Mới là ý tưởng
[ ] Có bản demo/prototype
[x] Đã có sản phẩm thử nghiệm
[ ] Đang triển khai thực tế

**6. Mô tả các tính năng cơ bản dự kiến của sản phẩm:**
- **Nhận diện té ngã thời gian thực:** Phân tích luồng video camera trực tiếp (Live Stream) và đưa ra nhận định ngã qua tư thế bằng AI ngay tức khắc.
- **Bảng điều khiển toàn diện (Dashboard Analytics):** Hiển thị màn hình giám sát trung tâm, thống kê tổng số lần cảnh báo, lịch sử cảnh báo (Alert History) hỗ trợ bộ lọc và biểu đồ biến động theo tuần/giờ. 
- **Theo dõi và ghi nhận hình ảnh:** Chụp và lưu trữ tự động các khoảnh khắc phát hiện té ngã vào Thư viện hình ảnh (Snapshot Gallery) kèm thông số nhận diện.
- **Phát Alerts:** Gửi thông báo tức thời qua Email tới người phụ trách kèm thông tin độ tin cậy.
- **Bộ máy quản lý dữ liệu log:** Lưu lại log lịch sử cảnh báo lâu dài và hỗ trợ tải xuống phân tích.

**7. Kết quả đã có (Nếu có):**
- Đã hoàn thiện mã nguồn Backend (FastAPI, Python) xử lý trơn tru mô hình YOLOv8 Pose phân tích các keypoints con người với thuật toán Spread Ratio tiên tiến. Hệ thống đạt độ trễ thấp và có thể chạy được trên phần cứng cơ bản.
- Đã triển khai được giao diện Frontend (Next.js, TypeScript, Tailwind) thân thiện với người dùng, kết nối thành công với Backend để hiện stream video qua luồng WebSocket và xem các bảng biểu thống kê Analytics.
- Đã hoàn thiện tính năng cảnh báo email qua SMTP và lưu trữ CSDL SQLite cơ bản phục vụ thử nghiệm hoàn chỉnh.

---

## C. CAM KẾT
[x] Tôi cam kết ý tưởng là do nhóm tự phát triển
[x] Đồng ý với thể lệ cuộc thi
[x] Đồng ý cho BTC sử dụng thông tin phục vụ cuộc thi