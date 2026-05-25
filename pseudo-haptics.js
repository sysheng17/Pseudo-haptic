// 1. 初始化 Three.js 透明場景 (alpha=true)
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera3D = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera3D.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// 2. 設置光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xa855f7, 0.8); // 紫色光源
dirLight.position.set(3, 4, 3);
scene.add(dirLight);

// 3. 建立高黏滯史萊姆 (初始置中)
const geometry = new THREE.SphereGeometry(0.5, 64, 64);
const originalPositions = geometry.attributes.position.clone();
const material = new THREE.MeshStandardMaterial({
    color: 0xa855f7,        // 紫色史萊姆
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85
});
const slimeMesh = new THREE.Mesh(geometry, material);
slimeMesh.position.set(0, 0, 0); 
scene.add(slimeMesh);

// 4. 抓取狀態機變數
let isGrabbed = false; 
const statusElement = document.getElementById('status');

// 座標映射轉換工具
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 5. 核心：主動抓取與肉墊隨動運算管線
function updatePadGrabSandboxPipeline() {
    if (!handData.hasHand) {
        isGrabbed = false;
        statusElement.innerText = " 等待右手伸入...";
        statusElement.style.color = "#cbd5e1";
        recoverMeshToNormal();
        return;
    }

    // 將指腹捏合中心點映射至 3D 空間 ( targetZ = 0.5，稍微往前推一點便於手機抓取)
    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0.5);
    
    // 計算手部捏合點與史萊姆中心點的距離
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    // 狀態機判定
    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 1.1) { // 放大判定半徑適配手機
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取中！指腹肉墊捏持";
        statusElement.style.color = "#a855f7";

        slimeMesh.position.lerp(pinchWorld, 0.18); // 手機端加快隨動速度

        // 【肉墊肉體錯覺演算法：大腦錯覺核心】
        // 頂點受力區域是「大範圍向內凹陷，像肉墊壓入一樣」
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
            
            // 【修復 2】拉大影響半徑 (effectRadius)，從 0.8 到 1.2
            // 這會製造出「大範圍、柔軟」的形變擴散，像厚重布料或肉墊按壓一樣。
            let effectRadius = 1.2; 

            if (distToLocalPinch < effectRadius) {
                // 受力公式調整為更柔和的緩入公式
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

        // 【修復 3】降低回彈速率 (從 0.1 到 0.05)
        // 回彈速度慢，製造厚重、黏滯的史萊姆體感。
        let nextX = THREE.MathUtils.lerp(currentX, origX, 0.05);
        let nextY = THREE.MathUtils.lerp(currentY, origY, 0.05);
        let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.05);
        positions.setXYZ(i, nextX, nextY, nextZ);
    }
}

// 6. 主動畫循環
function animate() {
    requestAnimationFrame(animate);
    
    // 如果沒被抓，在中央漂浮晃動
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y += Math.sin(Date.now() * 0.003) * 0.002;
        slimeMesh.rotation.y += 0.005;
    }

    updatePadGrabSandboxPipeline();
    renderer.render(scene, camera3D);
}

window.addEventListener('resize', () => {
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.set(0, 0, 0);
    }
});

animate();