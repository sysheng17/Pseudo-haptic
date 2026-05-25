let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

// 用於儲存大拇指與食指在歸一化空間 (-1 ~ 1) 的 3D 座標
let fingerPoints = {
    thumb: { x: 0, y: 0, z: 0 },
    index: { x: 0, y: 0, z: 0 },
    isPinching: false,
    pinchCenter: { x: 0, y: 0, z: 0 }
};

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusElement.innerText = "✅ 偵測到手部動態";
        statusElement.style.color = "#10b981";
        
        const landmarks = Array.from(results.multiHandLandmarks[0]);
        
        // MediaPipe 節點定義: 4 = 大拇指尖, 8 = 食指尖
        // 由於鏡頭是鏡像的，我們將 X 軸反轉 (1 - x) 來對齊畫面
        fingerPoints.thumb.x = (1 - landmarks[4].x) * 2 - 1; 
        fingerPoints.thumb.y = (1 - landmarks[4].y) * 2 - 1;
        fingerPoints.thumb.z = landmarks[4].z;

        fingerPoints.index.x = (1 - landmarks[8].x) * 2 - 1;
        fingerPoints.index.y = (1 - landmarks[8].y) * 2 - 1;
        fingerPoints.index.z = landmarks[8].z;

        // 計算兩指間距，判斷是否做出「捏合」動作
        const distance = Math.sqrt(
            Math.pow(fingerPoints.thumb.x - fingerPoints.index.x, 2) +
            Math.pow(fingerPoints.thumb.y - fingerPoints.index.y, 2)
        );

        // 當兩指距離小於臨界值，判定為捏合 (Pinch)
        if (distance < 0.15) {
            fingerPoints.isPinching = true;
            fingerPoints.pinchCenter.x = (fingerPoints.thumb.x + fingerPoints.index.x) / 2;
            fingerPoints.pinchCenter.y = (fingerPoints.thumb.y + fingerPoints.index.y) / 2;
            fingerPoints.pinchCenter.z = (fingerPoints.thumb.z + fingerPoints.index.z) / 2;
        } else {
            fingerPoints.isPinching = false;
        }
    } else {
        statusElement.innerText = "❌ 未偵測到手部";
        statusElement.style.color = "#ef4444";
        fingerPoints.isPinching = false;
    }
}

// 初始化 MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onHandResults);

// 開啟相機
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});
camera.start().then(() => {
    statusElement.innerText = "📷 相機啟動成功，等待手部...";
});