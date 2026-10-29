"""Run generated programs, comparing native OpenCV with the actual WASM engine."""
import json,sys,subprocess,csv,io,math
from pathlib import Path
import cv2 as cv
import numpy as np
folder=Path(sys.argv[1])
if not cv.__version__.startswith('4.13.'):
    raise RuntimeError(f'Use OpenCV 4.13.x for parity tests, found {cv.__version__}')
fixture=np.array(json.loads((folder/'fixture.json').read_text()),dtype=np.uint8).reshape(24,32,4)
cv.imwrite(str(folder/'fixture.png'),cv.cvtColor(fixture,cv.COLOR_RGBA2BGRA))
report=[]
for case in json.loads((folder/'expected.json').read_text()):
    source=np.array(case['sourcePixels'],dtype=np.uint8).reshape(24,32,4) if case.get('sourcePixels') is not None else fixture
    cv.imwrite(str(folder/'fixture.png'),cv.cvtColor(source,cv.COLOR_RGBA2BGRA))
    subprocess.run([sys.executable,str(folder/f"{case['id']}.py")],cwd=folder,check=True,capture_output=True)
    image=cv.imread(str(folder/'output.png'),cv.IMREAD_UNCHANGED)
    if image.ndim==3:image=cv.cvtColor(image,cv.COLOR_BGRA2RGBA)
    expected=np.array(case['pixels'],dtype=np.uint8).reshape(image.shape)
    delta=np.abs(image.astype(np.int16)-expected.astype(np.int16))
    # Native vectorized HSV/filters may round differently; exact operations stay exact.
    tolerance=3 if case['id']=='hue' else 1 if case['id'] in ['gaussian','box','bilateral','rotate','resize','brightness'] else 0
    maximum=int(delta.max());passed=maximum<=tolerance
    if case.get('csv') is not None:
        actual_rows=list(csv.reader((folder/case['csvFile']).read_text().splitlines()))
        expected_rows=list(csv.reader(io.StringIO(case['csv'])))
        if len(actual_rows)!=len(expected_rows) or actual_rows[0]!=expected_rows[0]:
            passed=False
        else:
            for actual_row,expected_row in zip(actual_rows[1:],expected_rows[1:]):
                if len(actual_row)!=len(expected_row): passed=False;continue
                for a,b in zip(actual_row,expected_row):
                    if a==b: continue
                    if not a or not b or not math.isclose(float(a),float(b),rel_tol=1e-12,abs_tol=1e-9): passed=False
    report.append({'operation':case['id'],'maxChannelDifference':maximum,'tolerance':tolerance,'passed':passed})
    print(f"{'PASS' if passed else 'FAIL'} {case['id']}: max difference {maximum} (tolerance {tolerance})")
(folder/'report.json').write_text(json.dumps({'opencv':cv.__version__,'cases':report},indent=2)+'\n')
if not all(c['passed'] for c in report):sys.exit(1)
print(f'All {len(report)} generated Python programs match the WASM output.')
