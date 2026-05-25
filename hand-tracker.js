// ==========================================
// 終極防卡死與手機相容性優化版 hand-tracker.js
// ==========================================

let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

// 全域共享的手勢資料狀態
let handData = {
    hasHand: false,
    indexPad: { x: 0, y: 0, z: 0 },   // 指腹中心 (食指節點 7)
    thumbPad: { x: 0, y: 0, z: 0 },   // 指腹中心 (大拇指節點 3)
    isPinching: false,
    pinchCenterNDC: { x: 0, y: 0, z: 0 }
};

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handData.hasHand = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // 映射至 2D 歸一化裝置座標系 (-1 ~ 1) NDC
        // 使用指腹關節 (7, 3) 提高穩定度與肉體帶入感
        handData.indexPad.x = (1 - landmarks[7].x) * 2 - 1;
        handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
        handData.indexPad.z = landmarks[7].z;

        handData.thumbPad.x = (1 - landmarks[3].x) * 2 - 1;
        handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;
        handData.thumbPad.z = landmarks[3].z;

        const dist2D = Math.sqrt(
            Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
            Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
        );

        if (dist2D < 0.20) {
            handData.isPinching = true;
            handData.pinchCenterNDC.x = (handData.indexPad.x + handData.thumbPad.x) / 2;
            handData.pinchCenterNDC.y = (handData.indexPad.y + handData.thumbPad.y) / 2;
            handData.pinchCenterNDC.z = (handData.indexPad.z + handData.thumbPad.z) / 2;
        } else {
            handData.isPinching = false;
        }
    } else {
        handData.hasHand = false;
        handData.isPinching = false;
    }
}

// 核心修正 1：建立異步捕捉，防止 CDN 載入失敗時卡死
let hands;
try {
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // 手機端強制設為 0 以免運算過載卡死
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onHandResults);
    console.log("MediaPipe Hands 載入成功");
} catch (e) {
    statusElement.innerText = "❌ AI 套件載入失敗";
}

// 核心修正 2：用原生 Web API 強制喚醒手機鏡頭並開啟權限彈窗
async function startCamera() {
    statusElement.innerText = "📷 正在請求鏡頭權限...";
    
    try {
        const constraints = {
            video: {
                facingMode: "user", // 使用前置鏡頭
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };
        
        // 喚醒手機原生相機
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        // 核心修正 3：使用標準的 requestAnimationFrame 迴圈定時將影像餵給 AI
        // 徹底取代官方不穩定的 new Camera().start()
        async function predictionLoop() {
            if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && hands) {
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
            statusElement.innerText = "❌ 請允許網頁相機權限";
        } else {
            statusElement.innerText = "❌ 鏡頭錯誤: " + err.message;
        }
        statusElement.style.color = "#ef4444";
    }
}

// 確保頁面載入完畢後自動觸發
window.addEventListener('DOMContentLoaded', startCamera);