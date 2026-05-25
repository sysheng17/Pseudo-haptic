// 1. 初始化 Three.js 場景
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827);

const camera3D = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera3D.position.z = 8;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// 2. 加入光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// 3. 建立可變形的高密度球體 (當作揉捏對象)
// 之後如果要讀取外部模型，只需在此處改用 GLTFLoader 讀取網址即可
const geometry = new THREE.SphereGeometry(1.8, 64, 64);
// 備份原始頂點位置，用於變形後的彈性復原計算
const originalPositions = geometry.attributes.position.clone();
const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.2,
    metalness: 0.1,
    wireframe: false // 可以設為 true 來觀察網格變形結構
});
const ballMesh = new THREE.Mesh(geometry, material);
scene.add(ballMesh);

// 4. 建立代表手指位置的視覺化小球
const pointerGeo = new THREE.SphereGeometry(0.1, 16, 16);
const pointerMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
scene.add(pointerMesh);

// 5. 核心：視覺觸覺形變演算法 (Pseudo-Haptics Loop)
function updateMeshDeformation() {
    const positions = geometry.attributes.position;
    const matType = document.getElementById('material-type').value;
    
    // 將手勢的 -1~1 空間映射到 3D 場景的座標系中
    // 這裡做了簡易的座標縮放對齊
    const targetX = fingerPoints.index.x * 4;
    const targetY = fingerPoints.index.y * 3;
    pointerMesh.position.set(targetX, targetY, 0);

    if (matType === 'hard') {
        // 剛體模式：直接將網格恢復原狀，不響應變形
        positions.copy(originalPositions);
        positions.needsUpdate = true;
        return;
    }

    let isInteracting = fingerPoints.isPinching;
    let interactPoint = new THREE.Vector3(fingerPoints.pinchCenter.x * 4, fingerPoints.pinchCenter.y * 3, 0);

    // 遍歷 3D 球體的所有頂點
    for (let i = 0; i < positions.count; i++) {
        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);

        let vertexWorldPos = new THREE.Vector3(origX, origY, origZ);
        let dist = vertexWorldPos.distanceTo(interactPoint);

        // 定義影響半徑
        let effectRadius = 1.2;

        if (isInteracting && dist < effectRadius) {
            // 【柔軟度與擠壓變形】
            // 越接近手指觸碰點，頂點往球心下陷或向外擴散的程度越大
            let force = (1.0 - (dist / effectRadius));
            
            if (matType === 'soft') {
                // 軟糖模式：受力點下陷，周圍依據擴散寬度公式隆起
                let deformX = origX - (interactPoint.x - origX) * force * 0.4;
                let deformY = origY - (interactPoint.y - origY) * force * 0.4;
                positions.setXYZ(i, deformX, deformY, currentZ);
            } else if (matType === 'sticky') {
                // 史萊姆模式：手指捏住時，頂點會往手指中心極度凝聚
                let stickyX = THREE.MathUtils.lerp(currentX, interactPoint.x, force * 0.3);
                let stickyY = THREE.MathUtils.lerp(currentY, interactPoint.y, force * 0.3);
                positions.setXYZ(i, stickyX, stickyY, currentZ);
            }
        } else {
            // 【彈性復原演算法】當手指離開，網格自動回彈
            // 史萊姆復原速度慢 (製造黏滯感拉伸)，軟糖復原速度快 (製造Q彈感)
            let recoverySpeed = (matType === 'sticky') ? 0.05 : 0.2;
            
            let nextX = THREE.MathUtils.lerp(currentX, origX, recoverySpeed);
            let nextY = THREE.MathUtils.lerp(currentY, origY, recoverySpeed);
            let nextZ = THREE.MathUtils.lerp(currentZ, origZ, recoverySpeed);
            positions.setXYZ(i, nextX, nextY, nextZ);
        }
    }
    
    positions.needsUpdate = true; // 隱式強制通知 GPU 重新渲染
    geometry.computeVertexNormals(); // 重新計算陰影與光照
}

// 6. 渲染循環
function animate() {
    requestAnimationFrame(animate);
    
    // 讓物體在沒被捏的時候有微微的自轉，看起來更立體
    if (!fingerPoints.isPinching) {
        ballMesh.rotation.y += 0.002;
    }

    updateMeshDeformation();
    renderer.render(scene, camera3D);
}

// 響應視窗縮放
window.addEventListener('resize', () => {
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 啟動 3D 渲染
animate();