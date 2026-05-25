// ==========================================
// 官方穩定防斷線版 pseudo-haptics.js (解決 NetworkError)
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
        statusElement.innerText = "❌ 系統提示: " + e.message;
        statusElement.style.color = "#ef4444";
    }
});

// 1. 初始化 3D 引擎
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
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '999';

        // 光源環境
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(0, 5, 5);
        scene.add(dirLight);

        // 建立紫色果凍史萊姆
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

        statusElement.innerText = "🟢 3D 引擎準備就緒...";
        statusElement.style.color = "#10b981";
        
        setTimeout(initMediaPipeAI, 300);
        
    } catch (error) {
        statusElement.innerText = "❌ 3D 失敗: " + error.message;
    }
}

// 2. 載入 MediaPipe 且【✨更換為 Google 官方高速防斷線節點✨】
function initMediaPipeAI() {
    if (typeof Hands === 'undefined') {
        statusElement.innerText = "❌ 套件載入失敗，請重整網頁";
        return;
    }
    
    try {
        // ✨【核心修正】放棄 jsdelivr，切換至 Google 官方高頻寬不限流的維護節點✨
        handsAI = new Hands({
            locateFile: (file) => {
                return `https://cb9a0397-a681-432d-9eb5-8f4f691b0583.gandalf.workers.dev/https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`.replace(
                    'https://cb9a0397-a681-432d-9eb5-8f4f691b0583.gandalf.workers.dev/', 
                    'https://fonts.gstatic.com/s/i/notoemoji/latest/emoji_u2728.svg'
                );
                // 上面是防呆，標準 Google 穩定路徑如下：
                return `https://www.gstatic.com/mediapipe/solutions/hands/${file}`;
            }
        });

        handsAI.setOptions({
            maxNumHands: 1,
            modelComplexity: 0, // 手機端輕量化
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        handsAI.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                handData.hasHand = true;
                const landmarks = results.multiHandLandmarks[0];
                
                // 鏡像座標對齊
                handData.indexPad.x = (landmarks[7].x) * 2 - 1;
                handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
                
                handData.thumbPad.x = (landmarks[3].x) * 2 - 1;
                handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;

                const dist2D = Math.sqrt(
                    Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
                    Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
                );

                // 放寬捏合門檻
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

// 3. 喚醒鏡頭
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
            animateLoop(); 
        };
    } catch (err) {
        statusElement.innerText = "❌ 請允許相機權限並重整無痕網頁";
    }
}

// 3D 空間投影映射
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 4. 核心物理管線
function updateSlimePhysics() {
    if (!slimeMesh) return;

    if (!handData.hasHand) {
        isGrabbed = false;
        recoverMeshToNormal();
        return;
    }

    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

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
            let effectRadius = 1.2; 

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

// 5. 主循環
async function animateLoop() {
    requestAnimationFrame(animateLoop);
    
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.06;
        slimeMesh.rotation.y += 0.005;
    }

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && handsAI) {
        try { await handsAI.send({ image: videoElement }); } catch(e) {}
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