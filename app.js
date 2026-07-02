let colorMode = 'hsv'; // 'hsv' | 'grayscale' | 'viridis' | 'magma'
let intervalId = null;
let camWidth = 640;
let camHeight = 480;
let levels = 3;
let windowSize = 15;
let video = document.getElementById('webcam');
let showOriginal = false;
let canvas = document.getElementById('output');
let ctx = canvas.getContext('2d', { willReadFrequently: true });
let prevFrame = null;
let referenceFrame = null;
let contrastStrength = 3;

// Builds a descriptive filename tag from the current visualization settings,
// e.g. "bos_result_viridis_c3_histeqON_l3_w15.png" — used for upload, burst,
// and recording downloads so exported files are self-documenting.
function buildResultFilename(extension) {
  let histTag = useHistEq ? 'histeqON' : 'histeqOFF';
  return 'bos_result_' + colorMode + '_c' + contrastStrength + '_' + histTag + '_l' + levels + '_w' + windowSize + '.' + extension;
}

// ROI variables
let roi = null; // {x, y, w, h}
let isDrawing = false;
let startX = 0;
let startY = 0;

let frameCount = 0;
let lastTime = performance.now();

document.getElementById('captureBtn').addEventListener('click', function() {
  if (referenceFrame == null) {
    referenceFrame = prevFrame;
    this.innerText = "Reference Frame Captured ✅ (Click to reset)";
  } else {
    referenceFrame = null;
    this.innerText = "Capture Reference Frame";
  }
});

document.getElementById('viewToggleBtn').addEventListener('click', function() {
  showOriginal = !showOriginal;
  
  if (showOriginal) {
    video.style.display = 'block';
    canvas.style.display = 'none';
    this.innerText = '🔄 Show BOS Feed';
  } else {
    video.style.display = 'none';
    canvas.style.display = 'block';
    this.innerText = '🔄 Show Original Feed';
  }
});

document.getElementById('colorModeSelect').addEventListener('change', function() {
  colorMode = this.value; // 'hsv' | 'grayscale' | 'viridis' | 'magma'
});

let useHistEq = false;
document.getElementById('histEqCheckbox').addEventListener('change', function() {
  useHistEq = this.checked;
});

// ROI drawing on canvas
canvas.addEventListener('mousedown', function(e) {
  let rect = canvas.getBoundingClientRect();
  let scaleX = camWidth / rect.width;
  let scaleY = camHeight / rect.height;
  startX = (e.clientX - rect.left) * scaleX;
  startY = (e.clientY - rect.top) * scaleY;
  isDrawing = true;
  roi = null;
});

canvas.addEventListener('mousemove', function(e) {
  if (!isDrawing) return;
  let rect = canvas.getBoundingClientRect();
  let scaleX = camWidth / rect.width;
  let scaleY = camHeight / rect.height;
  let currentX = (e.clientX - rect.left) * scaleX;
  let currentY = (e.clientY - rect.top) * scaleY;
  roi = clampRoi({
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    w: Math.abs(currentX - startX),
    h: Math.abs(currentY - startY)
  });
});

canvas.addEventListener('mouseup', function() {
  isDrawing = false;
  if (roi && (roi.w < 20 || roi.h < 20)) {
    roi = null;
  }
});

// Touch support for mobile
canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  let rect = canvas.getBoundingClientRect();
  let scaleX = camWidth / rect.width;
  let scaleY = camHeight / rect.height;
  let touch = e.touches[0];
  startX = (touch.clientX - rect.left) * scaleX;
  startY = (touch.clientY - rect.top) * scaleY;
  isDrawing = true;
  roi = null;
});

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  if (!isDrawing) return;
  let rect = canvas.getBoundingClientRect();
  let scaleX = camWidth / rect.width;
  let scaleY = camHeight / rect.height;
  let touch = e.touches[0];
  let currentX = (touch.clientX - rect.left) * scaleX;
  let currentY = (touch.clientY - rect.top) * scaleY;
  roi = clampRoi({
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    w: Math.abs(currentX - startX),
    h: Math.abs(currentY - startY)
  });
});

canvas.addEventListener('touchend', function() {
  isDrawing = false;
  if (roi && (roi.w < 20 || roi.h < 20)) {
    roi = null;
  }
});

// Keeps the ROI box fully inside the current frame bounds so cv.Mat.roi()
// never receives an out-of-bounds rect (which throws an OpenCV assertion error)
function clampRoi(r) {
  let x = Math.max(0, Math.min(r.x, camWidth - 1));
  let y = Math.max(0, Math.min(r.y, camHeight - 1));
  let w = Math.min(r.w, camWidth - x);
  let h = Math.min(r.h, camHeight - y);
  return { x, y, w, h };
}

let isPaused = false;

let currentCamera = 'user'; // user = front, environment = back

document.getElementById('switchBtn').addEventListener('click', function() {
  if (currentCamera === 'user') {
    currentCamera = 'environment';
    this.innerText = '🤳 Switch to Front Camera';
  } else {
    currentCamera = 'user';
    this.innerText = '📷 Switch to Back Camera';
  }
  prevFrame = null;
  referenceFrame = null;
  startWebcam();
});

let flashOn = false;

document.getElementById('flashBtn').addEventListener('click', async function() {
  let track = video.srcObject && video.srcObject.getVideoTracks()[0];
  
  if (!track) {
    alert('Camera not available!');
    return;
  }

  let capabilities = track.getCapabilities();
  
  if (!capabilities.torch) {
    alert('Flash not supported on this device/camera!');
    return;
  }

  flashOn = !flashOn;

  await track.applyConstraints({
    advanced: [{ torch: flashOn }]
  });

  this.innerText = flashOn ? '🔦 Flash ON' : '🔦 Flash OFF';
});

document.getElementById('pauseBtn').addEventListener('click', function() {
  if (!isPaused) {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    isPaused = true;
    this.innerText = "▶️ Resume Feed";
  } else {
    isPaused = false;
    this.innerText = "⏸️ Pause Feed";
    startWebcam();
  }
});

document.getElementById('contrastSlider').addEventListener('input', function() {
  contrastStrength = parseFloat(this.value);
  document.getElementById('contrastVal').innerText = this.value;
});

document.getElementById('levelsSlider').addEventListener('input', function() {
  levels = parseInt(this.value);
  document.getElementById('levelsVal').innerText = this.value;
});

document.getElementById('windowSlider').addEventListener('input', function() {
  windowSize = parseInt(this.value);
  document.getElementById('windowVal').innerText = this.value;
});

document.getElementById('resSelect').addEventListener('change', function() {
  let parts = this.value.split('x');
  camWidth = parseInt(parts[0]);
  camHeight = parseInt(parts[1]);
  document.getElementById('resVal').innerText = this.value;
  canvas.width = camWidth;
  canvas.height = camHeight;
  video.width = camWidth;
  video.height = camHeight;
  prevFrame = null;
  referenceFrame = null;
  roi = null;
  document.getElementById('captureBtn').innerText = "Capture Reference Frame";
  startWebcam();
});

document.getElementById('processBtn').addEventListener('click', function() {
  let refFile = document.getElementById('refImage').files[0];
  let flowFile = document.getElementById('flowImage').files[0];

  if (!refFile || !flowFile) {
    alert('Please select both images!');
    return;
  }

  if (refFile.size > 2 * 1024 * 1024 || flowFile.size > 2 * 1024 * 1024) {
    alert('Warning: Image size is over 2MB. This may slow down processing or crash on mobile.');
  }

  let img1 = new Image();
  let img2 = new Image();

  img1.onload = function() {
    img2.onload = function() {

      if (img1.width !== img2.width || img1.height !== img2.height) {
        alert('Warning: Both images have different resolutions!\nImage 1: ' + img1.width + 'x' + img1.height + '\nImage 2: ' + img2.width + 'x' + img2.height + '\nResults may be incorrect!');
      }

      canvas.width = img1.width;
      canvas.height = img1.height;

      ctx.drawImage(img1, 0, 0);
      let frame1 = ctx.getImageData(0, 0, img1.width, img1.height);

      ctx.drawImage(img2, 0, 0);
      let frame2 = ctx.getImageData(0, 0, img2.width, img2.height);

      let mat1 = cv.matFromImageData(frame1);
      let mat2 = cv.matFromImageData(frame2);

      let gray1 = new cv.Mat();
      let gray2 = new cv.Mat();
      cv.cvtColor(mat1, gray1, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(mat2, gray2, cv.COLOR_RGBA2GRAY);

      let flow = new cv.Mat();
      cv.calcOpticalFlowFarneback(
        gray1, gray2, flow,
        0.5, levels, windowSize, 3, 5, 1.2, 0
      );

      visualizeFlow(flow);
      document.getElementById('downloadBtn').style.display = 'inline-block';

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      document.getElementById('resumeBtn').style.display = 'inline-block';

      mat1.delete(); mat2.delete();
      gray1.delete(); gray2.delete();
      flow.delete();
    };
    img2.src = URL.createObjectURL(flowFile);
  };
  img1.src = URL.createObjectURL(refFile);
});

document.getElementById('downloadBtn').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = buildResultFilename('png');
  link.href = canvas.toDataURL();
  link.click();
});

document.getElementById('resumeBtn').addEventListener('click', function() {
  document.getElementById('resumeBtn').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'none';
  captureFrames();
});

let burstImg1 = null;
let burstImg2 = null;

document.getElementById('burstBtn').addEventListener('click', function() {
  this.innerText = "Capturing...";
  this.disabled = true;

  let tempCanvas = document.createElement('canvas');
  tempCanvas.width = camWidth;
  tempCanvas.height = camHeight;
  let tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(video, 0, 0, camWidth, camHeight);
  burstImg1 = tempCanvas.toDataURL('image/png');

  setTimeout(function() {
    tempCtx.drawImage(video, 0, 0, camWidth, camHeight);
    burstImg2 = tempCanvas.toDataURL('image/png');

    let img1 = new Image();
    let img2 = new Image();

    img1.onload = function() {
      img2.onload = function() {
        canvas.width = camWidth;
        canvas.height = camHeight;

        ctx.drawImage(img1, 0, 0);
        let frame1 = ctx.getImageData(0, 0, camWidth, camHeight);

        ctx.drawImage(img2, 0, 0);
        let frame2 = ctx.getImageData(0, 0, camWidth, camHeight);

        let mat1 = cv.matFromImageData(frame1);
        let mat2 = cv.matFromImageData(frame2);

        let gray1 = new cv.Mat();
        let gray2 = new cv.Mat();
        cv.cvtColor(mat1, gray1, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(mat2, gray2, cv.COLOR_RGBA2GRAY);

        let flow = new cv.Mat();
        cv.calcOpticalFlowFarneback(
          gray1, gray2, flow,
          0.5, levels, windowSize, 3, 5, 1.2, 0
        );

        visualizeFlow(flow);

        document.getElementById('burstDownloads').style.display = 'flex';
        document.getElementById('burstBtn').innerText = "📸 Capture Burst";
        document.getElementById('burstBtn').disabled = false;

        mat1.delete(); mat2.delete();
        gray1.delete(); gray2.delete();
        flow.delete();
      };
      img2.src = burstImg2;
    };
    img1.src = burstImg1;
  }, 0);
});

document.getElementById('downloadImg1').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = 'burst_image1.png';
  link.href = burstImg1;
  link.click();
});

document.getElementById('downloadImg2').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = 'burst_image2.png';
  link.href = burstImg2;
  link.click();
});

document.getElementById('downloadFlow').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = buildResultFilename('png');
  link.href = canvas.toDataURL();
  link.click();
});

let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

document.getElementById('recordBtn').addEventListener('click', function() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    clearInterval(recordingTimer);
    this.innerText = '🔴 Start Recording';
    document.getElementById('recordTimer').innerText = '00:00';
  } else {
    if (camWidth > 320) {
      alert('Warning: High resolution may cause lag or crash during recording. Recommended: 320x240 or lower.');
    }

    recordedChunks = [];
    recordingSeconds = 0;
    document.getElementById('downloadRecordBtn').style.display = 'none';

    let stream = canvas.captureStream();
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm'
    });

    mediaRecorder.ondataavailable = function(e) {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = function() {
      let blob = new Blob(recordedChunks, { type: 'video/webm' });
      let url = URL.createObjectURL(blob);
      let downloadBtn = document.getElementById('downloadRecordBtn');
      downloadBtn.style.display = 'inline-block';
      downloadBtn.onclick = function() {
        let link = document.createElement('a');
        link.download = buildResultFilename('webm');
        link.href = url;
        link.click();
      };
    };

    mediaRecorder.start();
    this.innerText = '⏹️ Stop Recording';

    recordingTimer = setInterval(function() {
      recordingSeconds++;
      let mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
      let secs = (recordingSeconds % 60).toString().padStart(2, '0');
      document.getElementById('recordTimer').innerText = mins + ':' + secs;

      if (recordingSeconds >= 30) {
        mediaRecorder.stop();
        clearInterval(recordingTimer);
        document.getElementById('recordBtn').innerText = '🔴 Start Recording';
        document.getElementById('recordTimer').innerText = '00:00';
      }
    }, 1000);
  }
});

function onOpenCvReady() {
  console.log("OpenCV Ready!");
  startWebcam();
}

function startWebcam() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  
  let constraints = {
    video: {
      facingMode: { exact: currentCamera },
      width: camWidth,
      height: camHeight
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      video.srcObject = stream;
      console.log("Webcam working! Camera: " + currentCamera);
      setTimeout(captureFrames, 1000);
    })
    .catch(function(error) {
      console.log("Camera switch error: " + error);
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentCamera,
          width: camWidth,
          height: camHeight
        }
      })
      .then(function(stream) {
        video.srcObject = stream;
        console.log("Webcam working fallback!");
        setTimeout(captureFrames, 1000);
      })
      .catch(function(err) {
        console.log("Webcam error: " + err);
      });
    });
}

function captureFrames() {
  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(function() {
    ctx.drawImage(video, 0, 0, camWidth, camHeight);
    let currentFrame = ctx.getImageData(0, 0, camWidth, camHeight);

    let baseFrame = referenceFrame != null ? referenceFrame : prevFrame;

    if (baseFrame != null) {
      let prev = cv.matFromImageData(baseFrame);
      let curr = cv.matFromImageData(currentFrame);

      let prevGray = new cv.Mat();
      let currGray = new cv.Mat();
      cv.cvtColor(prev, prevGray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(curr, currGray, cv.COLOR_RGBA2GRAY);

      // ROI — To process only selected area
      if (roi && roi.w > 20 && roi.h > 20) {
        let roiRect = new cv.Rect(
          Math.floor(roi.x), Math.floor(roi.y),
          Math.floor(roi.w), Math.floor(roi.h)
        );

        let prevRoi = prevGray.roi(roiRect);
        let currRoi = currGray.roi(roiRect);

        let flow = new cv.Mat();
        cv.calcOpticalFlowFarneback(
          prevRoi, currRoi, flow,
          0.5, levels, windowSize, 3, 5, 1.2, 0
        );

        // Only show flow on ROI area, black canvas elsewhere
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, camWidth, camHeight);

        // Draw ROI box outline
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(roi.x, roi.y, roi.w, roi.h);

        visualizeFlowInROI(flow, roi);
        updateFPS();

        prevRoi.delete();
        currRoi.delete();
        flow.delete();
      } else {
        // No ROI — process full frame
        let flow = new cv.Mat();
        cv.calcOpticalFlowFarneback(
          prevGray, currGray, flow,
          0.5, levels, windowSize, 3, 5, 1.2, 0
        );

        visualizeFlow(flow);
        updateFPS();
        flow.delete();
      }

      prev.delete();
      curr.delete();
      prevGray.delete();
      currGray.delete();
    }

    prevFrame = currentFrame;
  }, 50);
}

function updateFPS() {
  frameCount++;
  let now = performance.now();
  let elapsed = now - lastTime;
  if (elapsed >= 1000) {
    let fps = Math.round((frameCount * 1000) / elapsed);
    document.getElementById('fps').innerText = "FPS: " + fps;
    frameCount = 0;
    lastTime = now;
  }
}

// Viridis and Magma colormaps implemented as manual RGB lookup tables,
// interpolated from standard matplotlib control-point colors. This avoids
// depending on cv.applyColorMap()/cv.COLORMAP_VIRIDIS/cv.COLORMAP_MAGMA,
// which are part of the colormap module and are NOT present in every
// opencv.js build — when missing, calling them throws before cv.imshow()
// ever runs, which is why the canvas was stuck showing the raw camera feed.
// cv.LUT() is a core function and is reliably available everywhere.

const VIRIDIS_STOPS = [
  [0.000, 68, 1, 84],
  [0.125, 72, 40, 120],
  [0.250, 62, 74, 137],
  [0.375, 49, 104, 142],
  [0.500, 38, 130, 142],
  [0.625, 31, 158, 137],
  [0.750, 53, 183, 121],
  [0.875, 109, 205, 89],
  [1.000, 253, 231, 37]
];

const MAGMA_STOPS = [
  [0.000, 0, 0, 4],
  [0.125, 28, 16, 68],
  [0.250, 79, 18, 123],
  [0.375, 129, 37, 129],
  [0.500, 181, 54, 122],
  [0.625, 229, 80, 100],
  [0.750, 251, 135, 97],
  [0.875, 254, 194, 135],
  [1.000, 252, 253, 191]
];

function buildColormapLUT(stops) {
  let lutData = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    let t = i / 255;
    let idx = 0;
    while (idx < stops.length - 2 && stops[idx + 1][0] < t) idx++;
    let [t0, r0, g0, b0] = stops[idx];
    let [t1, r1, g1, b1] = stops[idx + 1];
    let localT = (t1 === t0) ? 0 : (t - t0) / (t1 - t0);
    lutData[i * 3 + 0] = Math.round(r0 + (r1 - r0) * localT);
    lutData[i * 3 + 1] = Math.round(g0 + (g1 - g0) * localT);
    lutData[i * 3 + 2] = Math.round(b0 + (b1 - b0) * localT);
  }
  return lutData;
}

// Plain JS arrays — built once at load time. No cv.Mat, no cv.LUT,
// no cv.applyColorMap. This is pure JavaScript with zero OpenCV
// dependency, so it works regardless of which opencv.js build is loaded.
const VIRIDIS_LUT = buildColormapLUT(VIRIDIS_STOPS);
const MAGMA_LUT = buildColormapLUT(MAGMA_STOPS);

function getColormapLUT(mode) {
  return mode === 'viridis' ? VIRIDIS_LUT : MAGMA_LUT;
}

// Converts magNorm (CV_32F, 0-255) to an 8-bit Mat, applying histogram
// equalization if enabled. Caller must delete the returned Mat.
function toGray8(magNorm) {
  let gray8 = new cv.Mat();
  magNorm.convertTo(gray8, cv.CV_8U);
  if (useHistEq) {
    try {
      cv.equalizeHist(gray8, gray8);
    } catch (err) {
      console.error('Histogram equalization failed:', err);
    }
  }
  return gray8;
}

// Reads an 8-bit single-channel Mat's raw pixel data directly and paints it
// onto the given canvas context via a manual colormap lookup + putImageData.
// No OpenCV colormap/LUT function is used anywhere here.
function renderMagnitudeColormap(gray8, targetCtx, offsetX, offsetY) {
  let cols = gray8.cols;
  let rows = gray8.rows;
  let src = gray8.data;
  let lut = getColormapLUT(colorMode);

  let imgData = targetCtx.createImageData(cols, rows);
  let out = imgData.data;

  for (let i = 0, n = cols * rows; i < n; i++) {
    let lutIdx = src[i] * 3;
    let outIdx = i * 4;
    out[outIdx] = lut[lutIdx];
    out[outIdx + 1] = lut[lutIdx + 1];
    out[outIdx + 2] = lut[lutIdx + 2];
    out[outIdx + 3] = 255;
  }

  targetCtx.putImageData(imgData, offsetX || 0, offsetY || 0);
}

// Plain min-max normalization stretches 0-255 based on the single brightest
// and darkest pixel in the whole frame. A handful of outlier pixels (e.g.
// edge/misalignment artifacts between the two source frames) can dominate
// that range and crush the real, subtle signal down near black.
// This clips magnitude to (mean + 3*stddev) BEFORE normalizing, so a few
// extreme outliers no longer set the scale for the entire image.
// cv.meanStdDev / cv.threshold are core functions present in virtually
// every opencv.js build (unlike colormap/LUT), but this still falls back
// to plain normalize if something's missing, rather than crashing.
function normalizeMagnitudeRobust(magnitude, magNorm) {
  try {
    let meanMat = new cv.Mat();
    let stddevMat = new cv.Mat();
    cv.meanStdDev(magnitude, meanMat, stddevMat);
    let meanVal = meanMat.data64F[0];
    let stdVal = stddevMat.data64F[0];
    meanMat.delete();
    stddevMat.delete();

    let clipMax = meanVal + contrastStrength * stdVal;
    if (!isFinite(clipMax) || clipMax < 1e-6) {
      cv.normalize(magnitude, magNorm, 0, 255, cv.NORM_MINMAX);
      return;
    }

    let clipped = new cv.Mat();
    cv.threshold(magnitude, clipped, clipMax, clipMax, cv.THRESH_TRUNC);
    cv.normalize(clipped, magNorm, 0, 255, cv.NORM_MINMAX);
    clipped.delete();
  } catch (err) {
    console.error('Robust normalize failed, falling back to plain min-max:', err);
    cv.normalize(magnitude, magNorm, 0, 255, cv.NORM_MINMAX);
  }
}

// Renders optical flow for the full frame onto the main output canvas
function visualizeFlow(flow) {
  let flowChannels = new cv.MatVector();
  cv.split(flow, flowChannels);
  let flowX = flowChannels.get(0);
  let flowY = flowChannels.get(1);

  let magnitude = new cv.Mat();
  let angle = new cv.Mat();
  cv.cartToPolar(flowX, flowY, magnitude, angle, true);

  let magNorm = new cv.Mat();
  normalizeMagnitudeRobust(magnitude, magNorm);

  if (colorMode === 'hsv') {
    // Direction (angle) -> hue, magnitude -> value. Only mode that encodes flow direction.
    let hsv = new cv.Mat();
    let hsvChannels = new cv.MatVector();
    let sat = new cv.Mat(flow.rows, flow.cols, cv.CV_32F, new cv.Scalar(255));
    hsvChannels.push_back(angle);
    hsvChannels.push_back(sat);
    hsvChannels.push_back(magNorm);
    cv.merge(hsvChannels, hsv);

    let hsv8 = new cv.Mat();
    hsv.convertTo(hsv8, cv.CV_8U);
    let outputImg = new cv.Mat();
    cv.cvtColor(hsv8, outputImg, cv.COLOR_HSV2RGB);
    cv.imshow('output', outputImg);
    outputImg.delete();

    hsv8.delete();
    hsv.delete();
    sat.delete();
    hsvChannels.delete();
  } else if (colorMode === 'grayscale') {
    let outputImg = toGray8(magNorm);
    cv.imshow('output', outputImg);
    outputImg.delete();
  } else {
    // viridis / magma — pure JS/Canvas path, no OpenCV colormap functions
    let gray8 = toGray8(magNorm);
    renderMagnitudeColormap(gray8, ctx, 0, 0);
    gray8.delete();
  }

  flowX.delete(); flowY.delete();
  magnitude.delete(); angle.delete();
  magNorm.delete();
  flowChannels.delete();
}

// Renders optical flow only within the selected ROI, drawn onto the canvas
// at the ROI's position. Must live at the top level (NOT nested inside
// visualizeFlow) so captureFrames() can actually call it.
function visualizeFlowInROI(flow, roi) {
  let flowChannels = new cv.MatVector();
  cv.split(flow, flowChannels);
  let flowX = flowChannels.get(0);
  let flowY = flowChannels.get(1);

  let magnitude = new cv.Mat();
  let angle = new cv.Mat();
  cv.cartToPolar(flowX, flowY, magnitude, angle, true);

  let magNorm = new cv.Mat();
  normalizeMagnitudeRobust(magnitude, magNorm);

  let tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.floor(roi.w);
  tempCanvas.height = Math.floor(roi.h);
  let tempCtx = tempCanvas.getContext('2d');

  if (colorMode === 'hsv') {
    let hsv = new cv.Mat();
    let hsvChannels = new cv.MatVector();
    let sat = new cv.Mat(flow.rows, flow.cols, cv.CV_32F, new cv.Scalar(255));
    hsvChannels.push_back(angle);
    hsvChannels.push_back(sat);
    hsvChannels.push_back(magNorm);
    cv.merge(hsvChannels, hsv);
    let hsv8 = new cv.Mat();
    hsv.convertTo(hsv8, cv.CV_8U);
    let outputMat = new cv.Mat();
    cv.cvtColor(hsv8, outputMat, cv.COLOR_HSV2RGB);
    cv.imshow(tempCanvas, outputMat);
    outputMat.delete();
    hsv8.delete();
    hsv.delete();
    sat.delete();
    hsvChannels.delete();
  } else if (colorMode === 'grayscale') {
    let outputMat = toGray8(magNorm);
    cv.imshow(tempCanvas, outputMat);
    outputMat.delete();
  } else {
    let gray8 = toGray8(magNorm);
    renderMagnitudeColormap(gray8, tempCtx, 0, 0);
    gray8.delete();
  }

  ctx.drawImage(tempCanvas, Math.floor(roi.x), Math.floor(roi.y));

  flowX.delete(); flowY.delete();
  magnitude.delete(); angle.delete();
  magNorm.delete();
  flowChannels.delete();
}
