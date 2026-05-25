// ========================================================
// HandTrack 萬用防斷線流暢版 pseudo-haptics.js
// ========================================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');
const videoElement = document.getElementById('webcam');

let scene, camera3D, renderer, slimeMesh, originalPositions;
let modelHT = null; // HandTrack 模型實例
let isGrabbed = false; 

// 統一的物理隨動座標狀態
let handData = {
    hasHand: false,
    x: 0, // NDC 座標 (-1 ~ 1)
    y: 0,
    score: 0
};

window.addEventListener('error', function(e) {
    if(statusElement) {
        statusElement.innerText = "❌ 系統提示: " + e.message;
        statusElement.style.color = "#ef4444";
    }
});

// 1. 初始化 Three.js
function initThreeEngine() {
    try {
        scene = new THREE.Scene();

        camera3D = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5); 

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0'; canvas.style.left = '0';
        canvas.style.width = '100vw'; canvas.style.height = '100vh';
        canvas.style.zIndex = '999';

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(0, 5, 5);
        scene.add(dirLight);

        const geometry = new THREE.SphereGeometry(0.5, 32, 32); 
        originalPositions = geometry.attributes.position.clone();
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xa855f7, 
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        slimeMesh.position.set(0, 0, 0); 
        scene.add(slimeMesh);

        statusElement.innerText = "🟢 3D 引擎就緒，正在加載輕量 AI...";
        statusElement.style.color = "#10b981";
        
        setTimeout(initHandTrackAI, 300);
        
    } catch (error) {
        statusElement.innerText = "❌ 3D 失敗: " + error.message;
    }
}

// 2. 初始化 HandTrack AI (免大檔案，純 JS 快取)
function initHandTrackAI() {
    if (typeof handTrack === 'undefined') {
        statusElement.innerText = "❌ 偵測套件未載入，請刷新重試";
        return;
    }

    // 行動端極致效能優化參數
    const modelParams = {
        flipHorizontal: false,   // 因為我們在 CSS 已經翻轉了視訊，這裡設為 false 剛好正正得正
        maxNumBoxes: 1,          // 只追蹤一隻手
        iouThreshold: 0.5,       
        scoreThreshold: 0.55     // 信心門檻
    };

    handTrack.load(modelParams).then(lmodel => {
        modelHT = lmodel;
        statusElement.innerText = "📷 正在開啟鏡頭...";
        startCameraStream();
    }).catch(err => {
        statusElement.innerText = "❌ AI 載入失敗: " + err.message;
    });
}

// 3. 喚醒前鏡頭
async function startCameraStream() {
    try {
        const constraints = {
            video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } }, // 縮小視訊解析度大幅提升手機運算幀率
            audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            statusElement.innerText = "🔍 尋找手部中...";
            statusElement.style.color = "#facc15";
            animateLoop(); 
        };
    } catch (err) {
        statusElement.innerText = "❌ 請允許相機權限並重整網頁";
    }
}

// 3D 空間反投影
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 4. 核心物理變形管線
function updateSlimePhysics() {
    if (!slimeMesh) return;

    if (!handData.hasHand) {
        isGrabbed = false;
        recoverMeshToNormal();
        return;
    }

    // 計算手部在 3D 世界的位置
    const handWorld = mapTo3DWorld(handData.x, handData.y, 0);
    const distToSlime = handWorld.distanceTo(slimeMesh.position);

    // 行動端防抖智能吸附：手掌靠近球體(距離小於2.2) 即刻觸發果凍黏滯吸附
    if (distToSlime < 2.2) {
        isGrabbed = true;
    } else {
        isGrabbed = false;
    }

    const positions = slimeMesh.geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = "🟣 觸覺互動中 ✨ 正在拉扯史萊姆";
        statusElement.style.color = "#a855f7";
        
        // 史萊姆隨動
        slimeMesh.position.lerp(handWorld, 0.25); 

        let localPinch = handWorld.clone().sub(slimeMesh.position);
        for (let i = 0; i < positions.count; i++) {
            let origX = originalPositions.getX(i);
            let origY = originalPositions.getY(i);
            let origZ = originalPositions.getZ(i);
            let currentX = positions.getX(i);
            let currentY = positions.getY(i);
            let currentZ = positions.getZ(i);

            let vertexPos = new THREE.Vector3(origX, origY, origZ);
            let dist = vertexPos.distanceTo(localPinch);
            let effectRadius = 1.3; 

            if (dist < effectRadius) {
                let force = Math.pow(1.0 - (dist / effectRadius), 1.5);
                positions.setXYZ(i, 
                    THREE.MathUtils.lerp(currentX, localPinch.x, force * 0.65),
                    THREE.MathUtils.lerp(currentY, localPinch.y, force * 0.65),
                    THREE.MathUtils.lerp(currentZ, localPinch.z, force * 0.65)
                );
            }
        }
    } else {
        statusElement.innerText = "👋 看到手了！請將手移至中央觸碰紫球";
        statusElement.style.color = "#10b981";
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    slimeMesh.geometry.computeVertexNormals();
}

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

// 5. 主渲染與 HandTrack 預測循環
function animateLoop() {
    requestAnimationFrame(animateLoop);
    
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.06;
        slimeMesh.rotation.y += 0.005;
    }

    // 呼叫 HandTrack 進行即時畫面預測
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && modelHT) {
        modelHT.detect(videoElement).then(predictions => {
            if (predictions && predictions.length > 0) {
                handData.hasHand = true;
                
                // 取得偵測方框的中心點
                const bbox = predictions[0].bbox;
                const handCenterX = bbox[0] + bbox[2] / 2;
                const handCenterY = bbox[1] + bbox[3] / 2;

                // 轉為 Three.js 的標準化設備座標 (NDC)
                // 註：因為 CSS 翻轉了視訊，這裡直接轉乘對應的 NDC 空間
                handData.x = (handCenterX / videoElement.videoWidth) * 2 - 1;
                handData.y = -(handCenterY / videoElement.videoHeight) * 2 + 1;
            } else {
                handData.hasHand = false;
            }
        });
    }

    updateSlimePhysics();
    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
}

window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('DOMContentLoaded', initThreeEngine);