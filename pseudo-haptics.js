// ========================================================
// 本地資產優化暨最終互動版 pseudo-haptics.js
// ========================================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');
const videoElement = document.getElementById('webcam');

let scene, camera3D, renderer, slimeMesh, originalPositions;
let handsAI;
let isGrabbed = false; 

// 全域手勢資料狀態機
let handData = {
    hasHand: false,
    indexPad: { x: 0, y: 0, z: 0 },
    thumbPad: { x: 0, y: 0, z: 0 },
    isPinching: false,
    pinchCenterNDC: { x: 0, y: 0, z: 0 }
};

// 全域錯誤捕獲器：一旦手機端執行發生異常，立刻顯示在狀態欄
window.addEventListener('error', function(e) {
    if(statusElement) {
        statusElement.innerText = "❌ 系統提示: " + e.message;
        statusElement.style.color = "#ef4444";
    }
});

// 1. 初始化 Three.js 3D 引擎
function initThreeEngine() {
    try {
        scene = new THREE.Scene();

        // 設置相機視角
        camera3D = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5); 

        // 開啟 alpha: true 讓 3D 畫布背景完全透明，透出底層的相機畫面
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // 強制將 3D Canvas 鋪滿全螢幕並置頂
        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '999';

        // 設置光照
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(0, 5, 5);
        scene.add(dirLight);

        // 建立高密度紫色果凍史萊姆
        const geometry = new THREE.SphereGeometry(0.5, 32, 32); 
        originalPositions = geometry.attributes.position.clone();
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xa855f7, // 經典亮紫色
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        slimeMesh.position.set(0, 0, 0); // 預設固定在畫面中央
        scene.add(slimeMesh);

        statusElement.innerText = "🟢 3D 引擎準備就緒...";
        statusElement.style.color = "#10b981";
        
        // 延遲載入 AI，防止硬體衝突
        setTimeout(initMediaPipeAI, 300);
        
    } catch (error) {
        statusElement.innerText = "❌ 3D 失敗: " + error.message;
    }
}

// 2. 初始化 MediaPipe 手勢 AI（✨ 終極修正：讀取 GitHub 本地 .data 資源 ✨）
function initMediaPipeAI() {
    if (typeof Hands === 'undefined') {
        statusElement.innerText = "❌ 套件載入失敗，請重整網頁";
        return;
    }
    
    try {
        handsAI = new Hands({
            locateFile: (file) => {
                // 🔥 關鍵修正：如果是大體積的 .data 檔案，強迫瀏覽器讀取你自己 GitHub 專案根目錄下的檔案，徹底繞過跨域限制！
                if (file.endsWith('.data')) {
                    return `./hands_solution_packed_assets.data`;
                }
                // 其他輕量化 WebAssembly 元件走標準 CDN
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
            }
        });

        handsAI.setOptions({
            maxNumHands: 1,
            modelComplexity: 0, // 0 代表輕量化模型，大幅提升手機執行幀率
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        handsAI.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                handData.hasHand = true;
                const landmarks = results.multiHandLandmarks[0];
                
                // 🛠️ 鏡像修復：對齊 CSS 翻轉後的視訊畫面 (X 軸同步)
                handData.indexPad.x = (landmarks[7].x) * 2 - 1;
                handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
                
                handData.thumbPad.x = (landmarks[3].x) * 2 - 1;
                handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;

                // 計算食指與大拇指指腹的 2D 距離
                const dist2D = Math.sqrt(
                    Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
                    Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
                );

                // 放寬手機端捏合判定門檻至 0.35
                handData.isPinching = (dist2D < 0.35);
                
                if (handData.isPinching) {
                    handData.pinchCenterNDC.x = (handData.indexPad.x + handData.thumbPad.x) / 2;
                    handData.pinchCenterNDC.y = (handData.indexPad.y + handData.thumbPad.y) / 2;
                }
            } else {
                handData.hasHand = false;
                handData.isPinching = false;
            }
        });

        startCameraStream();
    } catch (e) {
        statusElement.innerText = "❌ AI 啟動異常: " + e.message;
    }
}

// 3. 喚醒手機前鏡頭
async function startCameraStream() {
    try {
        const constraints = {
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            statusElement.innerText = "🔍 尋找手部中...";
            statusElement.style.color = "#facc15";
            animateLoop(); // 開啟核心主渲染與偵測循環
        };
    } catch (err) {
        statusElement.innerText = "❌ 請允許相機權限並重整無痕網頁";
    }
}

// 3D 空間反投影映射工具（將螢幕 2D 座標轉為 3D 空間座標）
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 4. 偽觸覺史萊姆物理形變與拉扯管線
function updateSlimePhysics() {
    if (!slimeMesh) return;

    if (!handData.hasHand) {
        isGrabbed = false;
        recoverMeshToNormal();
        return;
    }

    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    // 強大吸附力判定：半徑 2.5 內捏合即算成功抓取
    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 2.5) { 
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = slimeMesh.geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = "🟣 捏持互動中 ✨ 拖曳史萊姆";
        statusElement.style.color = "#a855f7";
        
        // 讓球體平滑跟隨手部 (Lerp 插值製造黏滯感)
        slimeMesh.position.lerp(pinchWorld, 0.3); 

        let localPinch = pinchWorld.clone().sub(slimeMesh.position);
        for (let i = 0; i < positions.count; i++) {
            let origX = originalPositions.getX(i);
            let origY = originalPositions.getY(i);
            let origZ = originalPositions.getZ(i);
            let currentX = positions.getX(i);
            let currentY = positions.getY(i);
            let currentZ = positions.getZ(i);

            let vertexPos = new THREE.Vector3(origX, origY, origZ);
            let dist = vertexPos.distanceTo(localPinch);
            let effectRadius = 1.2; // 受捏力拉扯的局部半徑

            if (dist < effectRadius) {
                let force = Math.pow(1.0 - (dist / effectRadius), 1.5);
                positions.setXYZ(i, 
                    THREE.MathUtils.lerp(currentX, localPinch.x, force * 0.6),
                    THREE.MathUtils.lerp(currentY, localPinch.y, force * 0.6),
                    THREE.MathUtils.lerp(currentZ, localPinch.z, force * 0.6)
                );
            }
        }
    } else {
        statusElement.innerText = "👋 看到手了！請捏拿紫球";
        statusElement.style.color = "#10b981";
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    slimeMesh.geometry.computeVertexNormals();
}

// 史萊姆彈性回彈至正球體
function recoverMeshToNormal() {
    const positions = slimeMesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        positions.setXYZ(i, 
            THREE.MathUtils.lerp(positions.getX(i), originalPositions.getX(i), 0.1),
            THREE.MathUtils.lerp(positions.getY(i), originalPositions.getY(i), 0.1),
            THREE.MathUtils.lerp(positions.getZ(i), originalPositions.getZ(i), 0.1)
        );
    }
}

// 5. 主渲染與 AI 影像發送循環
async function animateLoop() {
    requestAnimationFrame(animateLoop);
    
    // 閒置狀態下，史萊姆在畫面中央微微漂浮自轉
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.06;
        slimeMesh.rotation.y += 0.005;
    }

    // 將視訊畫面即時傳送給 MediaPipe 進行 AI 掌心骨骼運算
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && handsAI) {
        try { 
            await handsAI.send({ image: videoElement }); 
        } catch(e) {
            // 忽略偶發的硬體解碼掉幀錯誤，確保執行續不中斷
        }
    }

    updateSlimePhysics();
    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
}

// 手機橫豎螢幕動態適應
window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 當網頁架構 DOM 載入完畢後，立刻啟動 3D 引擎
window.addEventListener('DOMContentLoaded', initThreeEngine);