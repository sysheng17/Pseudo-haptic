// ==========================================
// 攔截大魔王 sw.js (Service Worker 攔截器)
// ==========================================

const CACHE_NAME = 'slime-anti-crash-v1';

// 監聽所有網頁發出的網路請求
self.addEventListener('fetch', (event) => {
    // 只要發現有人在偷偷要 .data 檔案
    if (event.request.url.includes('hands_solution_packed_assets.data')) {
        console.log('🛡️ 攔截到 MediaPipe 偷要大檔案，強制餵食假資產！');
        
        // 直接就地生成一個空的二進位檔案（Blob）回傳給它，完全不走網路！
        const mockResponse = new Response(new Blob([''], { type: 'application/octet-stream' }), {
            status: 200,
            statusText: 'OK',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Access-Control-Allow-Origin': '*'
            }
        });
        event.respondWith(mockResponse);
        return;
    }
    
    // 其他正常的 JS, CSS, 3D 請求直接放行
    event.respondWith(fetch(event.request));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});