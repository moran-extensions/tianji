const DATABASE = 'cj3-input-history';
let opening;
function database() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('records'); };
    request.onerror = () => { opening = null; reject(new Error('无法打开本机记录库')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
  });
  return opening;
}
export async function readData() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly'), request = tx.objectStore('records').get('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法读取本机记录'));
    tx.onabort = () => reject(new Error('读取本机记录失败'));
  });
}
export async function writeData(value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error('本机记录未保存，请检查可用空间后重试'));
    tx.objectStore('records').put(value, 'state');
  });
}
