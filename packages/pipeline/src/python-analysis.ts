/** Helpers shared by complete exports and step snippets. No user text is evaluated. */
export const analysisPython = `
def label_objects(image, connectivity):
    if image.ndim != 2: raise ValueError("Grayscale input required")
    count, labels = cv.connectedComponents(image, connectivity=connectivity, ltype=cv.CV_32S)
    if count - 1 > 10000: raise ValueError("More than 10,000 objects; reduce noise or image size")
    count, labels, stats, centroids = cv.connectedComponentsWithStats(image, connectivity=connectivity, ltype=cv.CV_32S)
    values, first = np.unique(labels, return_index=True)
    ordered = [int(values[i]) for i in np.argsort(first) if values[i] != 0]
    mapping = np.zeros(count, dtype=np.int32)
    rows = []
    for index, label in enumerate(ordered, 1):
        mapping[label] = index
        x, y, width, height, area = [int(v) for v in stats[label]]
        rows.append(dict(id=index, pixel_area=area, centroid_x=float(centroids[label, 0]), centroid_y=float(centroids[label, 1]), x=x, y=y, width=width, height=height, image_width=image.shape[1], image_height=image.shape[0]))
    return mapping[labels], rows

def component_image(image, connectivity):
    labels, rows = label_objects(image, connectivity)
    palette = np.array([[0, 0, 0, 255]] + [[64 + (i * 73) % 192, 64 + (i * 151) % 192, 64 + (i * 199) % 192, 255] for i in range(1, len(rows) + 1)], dtype=np.uint8)
    return palette[labels], rows

def filter_objects(image, connectivity, minimum, maximum):
    labels, rows = label_objects(image, connectivity)
    keep = np.array([0] + [255 if minimum <= r['pixel_area'] <= maximum else 0 for r in rows], dtype=np.uint8)
    return keep[labels]

def contour_image(image):
    if image.ndim != 2: raise ValueError("Grayscale input required")
    contours, _ = cv.findContours(image, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    if len(contours) > 10000: raise ValueError("More than 10,000 objects; reduce noise or image size")
    contours = sorted(contours, key=lambda c: int(np.min(c[:, 0, 1].astype(np.int64) * image.shape[1] + c[:, 0, 0])))
    rows = []
    for index, contour in enumerate(contours, 1):
        x, y, width, height = cv.boundingRect(contour)
        m = cv.moments(contour)
        rows.append(dict(id=index, contour_area=float(cv.contourArea(contour)), perimeter=float(cv.arcLength(contour, True)), centroid_x=m['m10']/m['m00'] if m['m00'] else '', centroid_y=m['m01']/m['m00'] if m['m00'] else '', x=x, y=y, width=width, height=height, image_width=image.shape[1], image_height=image.shape[0]))
    output = cv.cvtColor(image, cv.COLOR_GRAY2RGBA)
    cv.drawContours(output, contours, -1, (80, 210, 110, 255), 1, cv.LINE_8)
    return output, rows

def apply_mask(image, mask):
    if mask.ndim != 2: raise ValueError("Mask input requires grayscale")
    if image.shape[:2] != mask.shape: raise ValueError("Image and mask must have identical dimensions")
    output = np.zeros_like(image)
    cv.copyTo(image, mask, output)
    return output

def save_measurements(path, rows, kind):
    import csv
    columns = ['id', 'pixel_area' if kind == 'components' else 'contour_area'] + (['perimeter'] if kind == 'contours' else []) + ['centroid_x', 'centroid_y', 'x', 'y', 'width', 'height', 'image_width', 'image_height']
    with open(path, 'w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=columns, lineterminator='\\n')
        writer.writeheader()
        writer.writerows(rows)
`;
