// ==========================================
// 終極修復：修正手機直式/橫式投影飛出去問題 pseudo-haptics.js
// ==========================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');

// 1. 初始化 Three.js 關鍵變數 (不使用 alpha 透明，確保 100% 顯色)
let scene, camera3D, renderer, slimeMesh, originalPositions;
let isGrabbed = false; 

function initThree() {
    try {
        scene = new THREE.Scene();

        // 【核心修正 A】動態 FOV 公式：直式手機需要廣角視野才不卡飛球
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isPortrait = height > width;
        // 如果是直式，FOV 拉大到 65 (超廣角)；橫式則維持標準 50 
        const fov = isPortrait ? 65 : 50;
        
        camera3D = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
        camera3D.position.set(0, 0, 5); // 稍微拉遠相機視距

        // 初始化渲染器 (強制開啟最顯色模式，先不依賴透明背景)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // 強制渲染器 Canvas 直通最上層全螢幕
        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.objectFit = 'contain';

        // 2. 加入光源 (加強亮度與指向性，防止太暗)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(0, 5, 5);
        scene.add(dirLight);

        // 3. 建立紫色史萊姆 (暫時不透明，確保能看見球)
        const geometry = new THREE.SphereGeometry(0.55, 32, 32); // 稍微放大，提高顯色性
        originalPositions = geometry.attributes.position.clone();
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xa855f7,        // 亮紫色
            roughness: 0.2,
            metalness: 0.1,
            wireframe: false        // 如果還是看不到，可設為 true 測試
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        // 【核心修正 B】強制死鎖在中央 (0, 0, 0)
        slimeMesh.position.set(0, 0, 0); 
        scene.add(slimeMesh);

        console.log("Three.js 渲染器初始化成功，FOV:", fov);
        animate();
    } catch (error) {
        statusElement.innerText = "❌ WebGL 初始化失敗: " + error.message;
        statusElement.style.color = "#ef4444";
    }
}

// 座標映射轉換工具
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    if (!camera3D) return new THREE.Vector3(0,0,0);
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 4. 核心：主動抓取與形變管線
function updateGrabSandboxPipeline() {
    if (!slimeMesh || !geometry || typeof handData === 'undefined') return;

    if (!handData.hasHand) {
        isGrabbed = false;
        if (statusElement.innerText.includes("準備中") || statusElement.innerText.includes("尋找手部")) {
            // 維持 hand-tracker.js 傳來的「尋找手部中...」狀態
        } else {
            statusElement.innerText = " 👋 看到手了！請主動捏拿中央球體";
            statusElement.style.color = "#10b981";
        }
        recoverMeshToNormal();
        return;
    }

    // 將捏合中心點映射至 3D 空間 ( targetZ = 0.5，稍微往前推一點便於在手機抓取)
    const pinchWorld = mapTo3DWorld(handData.pinchCenter.x, handData.pinchCenter.y, 0.5);
    
    // 計算手部捏合點與史萊姆中心點的距離
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 1.2) { // 手機端拉大判定範圍，更好抓
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取成功！移動中";
        statusElement.style.color = "#a855f7";

        slimeMesh.position.lerp(pinchWorld, 0.2); // 手機端加快隨動速度

        let localPinch = pinchWorld.clone().sub(slimeMesh.position);
        
        for (let i = 0; i < positions.count; i++) {
            let origX = originalPositions.getX(i);
            let origY = originalPositions.getY(i);
            let origZ = originalPositions.getZ(i);
            let currentX = positions.getX(i);
            let currentY = positions.getY(i);
            let currentZ = positions.getZ(i);

            let vertexPos = new THREE.Vector3(origX, origY, origZ);
            let distToLocalPinch = vertexPos.distanceTo(localPinch);
            let effectRadius = 0.8;

            if (distToLocalPinch < effectRadius) {
                let pull = Math.pow(1.0 - (distToLocalPinch / effectRadius), 2);
                let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, pull * 0.4);
                let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, pull * 0.4);
                let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, pull * 0.4);
                positions.setXYZ(i, pullX, pullY, pullZ);
            }
        }
    } else {
        statusElement.innerText = " 👋 看到手了！請捏內中央球體";
        statusElement.style.color = "#10b981";
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
}

function recoverMeshToNormal() {
    if (!geometry) return;
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);
        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let nextX = THREE.MathUtils.lerp(currentX, origX, 0.1); // 回彈速率設慢一點展現黏度
        let nextY = THREE.MathUtils.lerp(currentY, origY, 0.1);
        let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.1);
        positions.setXYZ(i, nextX, nextY, nextZ);
    }
}

// 5. 主動畫循環
function animate() {
    requestAnimationFrame(animate);
    
    // 如果沒被抓，在中央微微漂浮晃動
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y += Math.sin(Date.now() * 0.003) * 0.002;
        slimeMesh.rotation.y += 0.005;
    }

    updateGrabSandboxPipeline();
    if (renderer && scene && camera3D) {
        renderer.render(scene, camera3D);
    }
}

// ✨【橫豎螢幕動態切換：投影與視野角 FOV 修正核心】
window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;

    // 1. 重設渲染器尺寸
    renderer.setSize(width, height);
    
    // 2. 【關鍵】重新計算投影長寬比與 FOV，防止直式手機史萊姆飛到外太空
    camera3D.aspect = width / height;
    camera3D.fov = isPortrait ? 65 : 50; // 直式手機自動切換超廣角拉回物件
    camera3D.updateProjectionMatrix();
    
    // 3. 確保球體強制回到中央 (0, 0, 0)
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.set(0, 0, 0);
    }
});

// 確保 DOM 載入後再初始化 3D
window.addEventListener('DOMContentLoaded', initThree);