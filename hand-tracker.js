// ==========================================
// 終極防卡死與手機相容性優化版 hand-tracker.js
// ==========================================

let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

// 全域共享的手勢資料狀態
let handData = {
    hasHand: false,
    indexTip: { x: 0, y: 0, z: 0 },
    thumbTip: { x: 0, y: 0, z: 0 },
    isPinching: false,
    pinchCenter: { x: 0, y: 0, z: 0 }
};

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handData.hasHand = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // 映射至 2D 歸一化裝置座標系 (-1 ~ 1)
        handData.indexTip.x = (1 - landmarks[8].x) * 2 - 1;
        handData.indexTip.y = (1 - landmarks[8].y) * 2 - 1;
        handData.indexTip.z = landmarks[8].z;

        handData.thumbTip.x = (1 - landmarks[4].x) * 2 - 1;
        handData.thumbTip.y = (1 - landmarks[4].y) * 2 - 1;
        handData.thumbTip.z = landmarks[4].z;

        // 計算食指與大拇指尖的距離
        const dist = Math.sqrt(
            Math.pow(handData.indexTip.x - handData.thumbTip.x, 2) +
            Math.pow(handData.indexTip.y - handData.thumbTip.y, 2)
        );

        // 手機螢幕較小，微調捏合判定敏感度
        if (dist < 0.22) {
            handData.isPinching = true;
            handData.pinchCenter.x = (handData.indexTip.x + handData.thumbTip.x) / 2;
            handData.pinchCenter.y = (handData.indexTip.y + handData.thumbTip.y) / 2;
            handData.pinchCenter.z = (handData.indexTip.z + handData.thumbTip.z) / 2;
        } else {
            handData.isPinching = false;
        }
    } else {
        handData.hasHand = false;
        handData.isPinching = false;
    }
}

// 核心修正 1：加上異常捕捉，防止 CDN 載入失敗時網格卡死
let hands;
try {
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // 手機端強制設為 0 加快運算，防止過熱
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onHandResults);
    console.log("MediaPipe Hands 初始化成功");
} catch (e) {
    statusElement.innerText = "❌ AI 套件載入失敗，請刷新重試";
    statusElement.style.color = "#ef4444";
}

// 核心修正 2：針對 iOS Safari / LINE / 微信 瀏覽器的鏡頭權限與相容性優化
async function startCamera() {
    statusElement.innerText = "📷 正在請求鏡頭權限...";
    
    try {
        // 強制指定後置鏡頭（environment）或前置鏡頭（user），AR 捏捏通常用前置（user）
        const constraints = {
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };
        
        // 取得硬體串流
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        // 核心修正 3：使用標準的 requestAnimationFrame 驅動 MediaPipe，取代不穩定的 Camera 工具
        async function predictionLoop() {
            if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
                await hands.send({ image: videoElement });
            }
            requestAnimationFrame(predictionLoop);
        }
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            statusElement.innerText = "🔍 鏡頭已開啟，尋找手部中...";
            statusElement.style.color = "#eab308";
            predictionLoop();
        };

    } catch (err) {
        console.error("鏡頭啟動錯誤: ", err);
        if (err.name === "NotAllowedError") {
            statusElement.innerText = "❌ 請允許網頁使用相機權限";
        } else {
            statusElement.innerText = "❌ 鏡頭錯誤: " + err.message;
        }
        statusElement.style.color = "#ef4444";
    }
}

// 確保 DOM 載入後再執行鏡頭請求
window.addEventListener('DOMContentLoaded', startCamera);