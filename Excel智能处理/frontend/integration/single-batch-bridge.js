const EXCEL_BATCH_BRIDGE_STORAGE_KEYS = {
  currentProduct: 'current_product',
  pendingImageUpdate: 'xobi_excel_pending_image_update'
};

function excelBatchBridgeSafeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function excelBatchBridgeIsFromBatch() {
  return new URLSearchParams(window.location.search).get('from') === 'batch';
}

function excelBatchBridgePathToOutputsUrl(imagePath) {
  if (!imagePath) return '';
  if (imagePath.startsWith('/outputs/')) return imagePath;

  const normalized = String(imagePath).replace(/\\/g, '/');

  const marker = '/data/outputs/';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex !== -1) {
    return '/outputs/' + normalized.substring(markerIndex + marker.length);
  }

  const outputsIndex = normalized.lastIndexOf('/outputs/');
  if (outputsIndex !== -1) {
    return normalized.substring(outputsIndex);
  }

  return '';
}

function excelBatchBridgeSavePendingImageUpdate({ rowIndex = null, skuid = '', newImageUrl }) {
  if (!newImageUrl) return false;
  localStorage.setItem(
    EXCEL_BATCH_BRIDGE_STORAGE_KEYS.pendingImageUpdate,
    JSON.stringify({
      _row_index: rowIndex,
      skuid,
      new_image: newImageUrl,
      updatedAt: Date.now()
    })
  );
  return true;
}

function excelBatchBridgeApplySingleResultToBatch({ singleResultPath, batchImportUrl = 'batch-import.html?restore=1' }) {
  if (!excelBatchBridgeIsFromBatch()) return false;
  const product = excelBatchBridgeSafeJsonParse(localStorage.getItem(EXCEL_BATCH_BRIDGE_STORAGE_KEYS.currentProduct));
  if (!product) return false;

  const newImageUrl = excelBatchBridgePathToOutputsUrl(singleResultPath);
  if (!newImageUrl) return false;

  excelBatchBridgeSavePendingImageUpdate({
    rowIndex: product._row_index ?? null,
    skuid: product.skuid || '',
    newImageUrl
  });

  window.location.href = batchImportUrl;
  return true;
}

window.ExcelBatchBridge = {
  EXCEL_BATCH_BRIDGE_STORAGE_KEYS,
  excelBatchBridgeIsFromBatch,
  excelBatchBridgeSafeJsonParse,
  excelBatchBridgePathToOutputsUrl,
  excelBatchBridgeSavePendingImageUpdate,
  excelBatchBridgeApplySingleResultToBatch
};

