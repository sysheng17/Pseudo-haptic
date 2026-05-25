// 1. 初始化 Three.js 場景 (開啟 alpha 透明實現 AR)
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera3D = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera3D.position.set(0, 0, 6); // 稍微拉遠一點視距適配手機

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// 2. 設置光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x22c55e, 0.8); // 史萊姆綠色指向光
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// 3. 建立黏滯史萊姆 (初始位置固定在螢幕正中央，直徑較小)
const geometry = new THREE.SphereGeometry(0.35, 64, 64);
const originalPositions = geometry.attributes.position.clone();
const material = new THREE.MeshStandardMaterial({
    color: 0x22c55e,        // 經典史萊姆螢光綠
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
    wireframe: false
});
const slimeMesh = new THREE.Mesh(geometry, material);
slimeMesh.position.set(0, 0, 0); 
scene.add(slimeMesh);

// 座標映射轉換工具
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 4. 核心：AR 骨骼錨定與非接觸黏滯牽絲形變演算法
function updateArStickyPipeline() {
    if (typeof handData === 'undefined' || !handData.hasHand) {
        slimeMesh.visible = false;
        recoverMeshToNormal();
        return;
    }
    slimeMesh.visible = true;

    // 將食指尖與大拇指尖轉化為 3D 空間實際座標
    const indexWorld = mapTo3DWorld(handData.indexTip.x, handData.indexTip.y, 0);
    const thumbWorld = mapTo3DWorld(handData.thumbTip.x, handData.thumbTip.y, 0);

    // 【座標排除問題核心】
    // 一開始位置強制錨定鎖定在「食指尖」上
    slimeMesh.position.copy(indexWorld);

    const positions = geometry.attributes.position;
    
    // 如果大拇指和食指正在捏合 (代表拉扯狀態)
    let isPulling = handData.isPinching;

    // 計算大拇指在史萊姆局部座標系的座標 (計算頂點位移)
    let localThumb = thumbWorld.clone().sub(slimeMesh.position);

    for (let i = 0; i < positions.count; i++) {
        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);

        let vertexPos = new THREE.Vector3(origX, origY, origZ);
        
        // 頂點與大拇指拉扯點的距離
        let distToThumb = vertexPos.distanceTo(localThumb);
        let effectRadius = 0.9;

        if (isPulling && distToThumb < effectRadius) {
            // 【史萊姆高黏滯牽絲效果：大腦錯覺核心】
            // 頂點會被拉扯往大拇指方向偏移，製造強烈黏滯牽絲感
            let pull = Math.pow(1.0 - (distToThumb / effectRadius), 2);
            let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, pull * 0.45); // lerp 插值製造隨動平滑感
            let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, pull * 0.45);
            let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, pull * 0.45);
            positions.setXYZ(i, pullX, pullY, pullZ);
        } else {
            // 【史萊姆黏滯回彈】
            // 當手放開，網格自動回彈。但速度很慢 (0.05) 製造「黏答答」的回彈厚重感
            let nextX = THREE.MathUtils.lerp(currentX, origX, 0.05);
            let nextY = THREE.MathUtils.lerp(currentY, origY, 0.05);
            let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.05);
            positions.setXYZ(i, nextX, nextY, nextZ);
        }
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
}

// 5. 渲染循環
function animate() {
    requestAnimationFrame(animate);
    
    // 蠕動微幅旋轉
    if (!handData.isPinching && handData.hasHand) {
        slimeMesh.rotation.y += 0.01;
    }

    updateArStickyPipeline();
    renderer.render(scene, camera3D);
}

// 響應全螢幕縮放與手機翻轉
window.addEventListener('resize', () => {
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();