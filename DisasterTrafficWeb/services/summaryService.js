import { GoogleGenerativeAI } from '@google/generative-ai';
import Alert from '../models/Alert.js';

export async function generateAreaSummary(lat, lng, radiusMeters = 5000) {
    const radiusRad = radiusMeters / 6371000; // convert meters to radians
    
    // Find active alerts within radius
    const alerts = await Alert.find({
        location: {
            $geoWithin: {
                $centerSphere: [[lng, lat], radiusRad]
            }
        }
    }).lean();

    if (alerts.length === 0) {
        return {
            summary: 'Khu vực này hiện tại an toàn. Không phát hiện bất kỳ sự cố thiên tai hay ùn tắc giao thông nào trong bán kính giám sát.',
            alertsCount: 0,
            generatedBy: 'system'
        };
    }

    // Format alerts for LLM prompt
    const alertListStr = alerts
        .map((a, i) => `${i + 1}. Loại: ${a.type}, Địa điểm: ${a.address}, Mô tả: ${a.description || 'Không có mô tả'}, Mức độ: ${a.severity}/5`)
        .join('\n');

    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey || apiKey.trim() === '' || apiKey.includes('replace_me')) {
        // Fallback rule-based summary if API key is not configured
        const typesCount = {};
        let totalSeverity = 0;
        for (const a of alerts) {
            typesCount[a.type] = (typesCount[a.type] || 0) + 1;
            totalSeverity += a.severity;
        }
        
        const avgSeverity = (totalSeverity / alerts.length).toFixed(1);
        const typesStr = Object.entries(typesCount)
            .map(([type, count]) => `${count} sự cố ${type}`)
            .join(', ');

        return {
            summary: `[Bản tin tự động] Phát hiện tổng cộng ${alerts.length} cảnh báo trong khu vực (${typesStr}). Mức độ nghiêm trọng trung bình là ${avgSeverity}/5. Người dân di chuyển qua khu vực này cần chú ý quan sát và tuân thủ hướng dẫn giao thông.`,
            alertsCount: alerts.length,
            generatedBy: 'rule-engine'
        };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Bạn là trợ lý khẩn cấp chuyên trách về an toàn giao thông và thiên tai tại TP.HCM.
Dưới đây là danh sách các báo cáo sự cố ghi nhận được tại một khu vực trong bán kính ${radiusMeters}m:
${alertListStr}

Hãy viết một bản tóm tắt tình huống ngắn gọn (khoảng 3-4 câu, tiếng Việt) tóm tắt tình hình tổng quan của khu vực này, chỉ ra các nguy cơ chính (ví dụ: ngập lụt, cháy, kẹt xe cục bộ ở đâu) và đưa ra lời khuyên di chuyển thực tế cho người dân. Đọc dễ hiểu, cô đọng, chuyên nghiệp.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return {
            summary: text.trim(),
            alertsCount: alerts.length,
            generatedBy: 'gemini'
        };
    } catch (err) {
        console.error('[summaryService] Gemini API error:', err);
        return {
            summary: `Đã phát hiện ${alerts.length} sự cố trong khu vực. (Có lỗi khi gọi trợ lý AI để phân tích tóm tắt: ${err.message})`,
            alertsCount: alerts.length,
            generatedBy: 'error-fallback'
        };
    }
}
