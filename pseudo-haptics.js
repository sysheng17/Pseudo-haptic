// 1. 初始化 Three.js (開啟 alpha 透明實現 AR)
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera3D = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera3D.position.set(0, 0, 5); // 稍微拉遠相機視距

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// 2. 設置光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xa855f7, 0.9); // 紫色光源
dirLight.position.set(3, 4, 3);
scene.add(dirLight);

// 3. 建立高密度史萊姆
const geometry = new THREE.SphereGeometry(0.5, 64, 64);
const originalPositions = geometry.attributes.position.clone();
const material = new THREE.MeshStandardMaterial({
    color: 0xa855f7,        // 紫色果凍史萊姆
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85
});
const slimeMesh = new THREE.Mesh(geometry, material);
slimeMesh.position.set(0, 0, 0); 
scene.add(slimeMesh);

// 抓取狀態機變數
let isGrabbed = false; 
const statusElement = document.getElementById('status');

// 動態自適應投影矩陣轉換工具
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 4. 核心：主動抓取與黏滯形變管線
function updateGrabSandboxPipeline() {
    if (!handData.hasHand) {
        isGrabbed = false;
        recoverMeshToNormal();
        return;
    }

    // 將大腦判定的捏合 NDC 座標轉換為 3D 世界座標 (targetZ=0.5 稍微往前推適配手機)
    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0.5);
    
    // 計算手部捏合點與史萊姆中心點的距離
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 1.0) { // 手機判定半徑大一點
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取中！指腹肉墊捏持";
        statusElement.style.color = "#a855f7";

        slimeMesh.position.lerp(pinchWorld, 0.15); // 微量插值，製造水球甩動感

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
            
            // 肉體感擴散半徑 ( Effect Radius 1.2 )
            let effectRadius = 1.2; 

            if (distToLocalPinch < effectRadius) {
                // 受力公式調整，使形變更柔和且有肉墊感
                let force = Math.pow(1.0 - (distToLocalPinch / effectRadius), 1.5);
                
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

        // 回彈速率設慢一點展現厚重黏度 (從 0.1 到 0.05)
        let nextX = THREE.MathUtils.lerp(currentX, origX, 0.05);
        let nextY = THREE.MathUtils.lerp(currentY, origY, 0.05);
        let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.05);
        positions.setXYZ(i, nextX, nextY, nextZ);
    }
}

// 5. 渲染循環
function animate() {
    requestAnimationFrame(animate);
    
    // 如果沒被抓，在中央微微漂浮自轉
    if (!isGrabbed && handData.hasHand) {
        slimeMesh.position.y += Math.sin(Date.now() * 0.003) * 0.002;
        slimeMesh.rotation.y += 0.005;
    }

    updateGrabSandboxPipeline();
    renderer.render(scene, camera3D);
}

// ✨【橫豎螢幕自適應核心修正】✨
window.addEventListener('resize', () => {
    // 重新計算長寬比
    camera3D.aspect = window.innerWidth / window.innerHeight;
    // ✨ 關鍵：更新相機投影矩陣，防止史萊姆變隱形 ✨
    camera3D.updateProjectionMatrix();
    // 重新設定渲染器大小
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (!isGrabbed) {
        // 如果沒被抓，翻轉螢幕時自動把史萊姆拉回當前畫面的中央
        slimeMesh.position.set(0, 0, 0);
    }
});

// 開啟程式
animate();