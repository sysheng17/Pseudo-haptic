// ==========================================
// AR 最終啟用版 pseudo-haptics.js (開啟相機背景與紫色材質)
// ==========================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');
const videoElement = document.getElementById('webcam');

let scene, camera3D, renderer, slimeMesh, originalPositions;
let handsAI;
let isGrabbed = false; 

// 全域手勢資料
let handData = {
    hasHand: false,
    indexPad: { x: 0, y: 0, z: 0 },
    thumbPad: { x: 0, y: 0, z: 0 },
    isPinching: false,
    pinchCenterNDC: { x: 0, y: 0, z: 0 }
};

// 全域錯誤捕獲器
window.addEventListener('error', function(e) {
    if(statusElement) {
        statusElement.innerText = "❌ 腳本錯誤: " + e.message;
        statusElement.style.color = "#ef4444";
    }
});

// 1. 第一步：強制初始化 3D 引擎
function initThreeEngine() {
    console.log("開始初始化 Three.js...");
    statusElement.innerText = "🧱 正在啟動 3D 引擎...";
    
    try {
        scene = new THREE.Scene();
        // ✨核心修正：移除深色背景塗層，讓背景回歸全透明✨
        // scene.background = new THREE.Color(0x0f172a); 

        camera3D = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5); 

        // ✨核心修正：開啟 alpha: true，讓 3D 畫布可以透明穿透底層相機畫面✨
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // 強制拉開畫布 CSS
        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '999';

        // 光源 (加強亮度)
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        // 建立幾何體 (稍為縮小一點適配手機體感)
        const geometry = new THREE.SphereGeometry(0.5, 32, 32); 
        originalPositions = geometry.attributes.position.clone();
        
        // ✨核心修正：換回紫色果凍史萊姆材質 ✨
        // 關閉亮綠色線框模式
        const material = new THREE.MeshStandardMaterial({
            color: 0xa855f7,        // 亮紫色
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        slimeMesh.position.set(0, 0, 0); 
        scene.add(slimeMesh);

        statusElement.innerText = "🟢 3D 解鎖成功，載入 AI 中...";
        statusElement.style.color = "#10b981";
        
        // 3D 成功繪製後，才進下一步
        setTimeout(initMediaPipeAI, 300);
        
    } catch (error) {
        statusElement.innerText = "❌ 3D 失敗: " + error.message;
    }
}

// 2. 第二步：載入 MediaPipe
function initMediaPipeAI() {
    if (typeof Hands === 'undefined') {
        statusElement.innerText = "❌ 錯誤: MediaPipe 庫未載入";
        return;
    }
    
    try {
        handsAI = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsAI.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        handsAI.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                handData.hasHand = true;
                const landmarks = results.multiHandLandmarks[0];
                
                handData.indexPad.x = (1 - landmarks[7].x) * 2 - 1;
                handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
                handData.thumbPad.x = (1 - landmarks[3].x) * 2 - 1;
                handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;

                const dist2D = Math.sqrt(
                    Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
                    Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
                );

                // 行動端捏合距離設定 0.2
                handData.isPinching = (dist2D < 0.2);
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
        statusElement.innerText = "❌ AI 出錯: " + e.message;
    }
}

// 3. 第三步：喚醒鏡頭 (iOS 相容性優化)
async function startCameraStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusElement.innerText = "❌ 不支援相機 API";
        return;
    }

    statusElement.innerText = "📷 正在喚醒相機權限...";

    try {
        const constraints = {
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
            // iOS 強制播放優化
            videoElement.play();
            statusElement.innerText = "🔍 尋找手部中...";
            statusElement.style.color = "#facc15";
            animateLoop(); // 開啟渲染循環
        };
    } catch (err) {
        console.error(err);
        statusElement.innerText = "❌ 相機權限遭拒: " + err.name;
    }
}

// 4. 座標映射與形變
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    if (!camera3D) return new THREE.Vector3(0,0,0);
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

function updateSlimePhysics() {
    if (!slimeMesh) return;

    if (!handData.hasHand) {
        isGrabbed = false;
        if (statusElement.innerText.includes("尋找")) {
            // 維持尋找中
        } else {
            statusElement.innerText = " 👋 看到手了！請捏拿紫球";
            statusElement.style.color = "#10b981";
        }
        recoverMeshToNormal();
        return;
    }

    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0.5);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching && distToSlime < 1.2) {
        isGrabbed = true;
    } else if (!handData.isPinching) {
        isGrabbed = false;
    }

    const positions = slimeMesh.geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = "🟣 捏持互動中 ✨";
        statusElement.style.color = "#a855f7";
        slimeMesh.position.lerp(pinchWorld, 0.22); // 手機端加快隨動

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
            
            // 肉體感擴散半徑 (Effect Radius 1.0)
            let effectRadius = 1.0; 

            if (dist < effectRadius) {
                // 受力公式
                let force = Math.pow(1.0 - (dist / effectRadius), 1.5);
                
                let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, force * 0.45);
                let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, force * 0.45);
                let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, force * 0.45);
                positions.setXYZ(i, pullX, pullY, pullZ);
            }
        }
    } else {
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    slimeMesh.geometry.computeVertexNormals();
}

function recoverMeshToNormal() {
    const positions = slimeMesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        positions.setXYZ(i, 
            THREE.MathUtils.lerp(positions.getX(i), originalPositions.getX(i), 0.08),
            THREE.MathUtils.lerp(positions.getY(i), originalPositions.getY(i), 0.08),
            THREE.MathUtils.lerp(positions.getZ(i), originalPositions.getZ(i), 0.08)
        );
    }
}

// 5. 主渲染與 AI 影像發送循環
async function animateLoop() {
    requestAnimationFrame(animateLoop);
    
    // 如果沒被抓，在中央微微漂浮自轉
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.08;
        slimeMesh.rotation.y += 0.006;
    }

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && handsAI) {
        try {
            await handsAI.send({ image: videoElement });
        } catch(e) {
            // 忽略幀率錯誤
        }
    }

    updateSlimePhysics();
    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
}

// 響應縮放
window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.set(0, 0, 0); // 回歸中央
    }
});

// 單一入口點：DOMContentLoaded
window.addEventListener('DOMContentLoaded', initThreeEngine);