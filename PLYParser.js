/**
 * PLYParser - parses PLY (Polygon File Format) files.
 *
 *   parsePlyData(string | ArrayBuffer | Buffer | TypedArray) -> {
 *     vertices: [[x, y, z], ...],
 *     faces:    [[i0, i1, i2, ...], ...]   (polygons of any size, as stored in the file)
 *     colors:   [[r, g, b], ...]           (raw values as stored, e.g. 0-255 for uchar; [] if none)
 *     normals:  [[nx, ny, nz], ...]        ([] if none)
 *   }
 *
 * Supports ascii, binary_little_endian and binary_big_endian files. The header drives parsing,
 * so any vertex layout (extra properties, any order) and any extra elements are handled.
 * Binary files must be passed as bytes (e.g. fs.readFileSync(path) without an encoding).
 * Throws an Error with a readable message on malformed input.
 */
(function () {
    // name -> { size, get: DataView getter, integer }
    const TYPES = {};
    for (const [names, size, get, integer] of [
        [['char', 'int8'], 1, 'getInt8', true],
        [['uchar', 'uint8'], 1, 'getUint8', true],
        [['short', 'int16'], 2, 'getInt16', true],
        [['ushort', 'uint16'], 2, 'getUint16', true],
        [['int', 'int32'], 4, 'getInt32', true],
        [['uint', 'uint32'], 4, 'getUint32', true],
        [['float', 'float32'], 4, 'getFloat32', false],
        [['double', 'float64'], 8, 'getFloat64', false],
    ]) for (const n of names) TYPES[n] = {size, get, integer};

    const NORMAL_NAMES = [['nx', 'ny', 'nz'], ['normal_x', 'normal_y', 'normal_z']];
    const COLOR_NAMES = [['red', 'green', 'blue'], ['r', 'g', 'b'], ['diffuse_red', 'diffuse_green', 'diffuse_blue']];
    const FACE_LIST_NAMES = ['vertex_indices', 'vertex_index'];

    function parsePlyData(input) {
        let bytes = null, text;
        if (typeof input === 'string') text = input;
        else if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
            bytes = ArrayBuffer.isView(input)
                ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
                : new Uint8Array(input);
            text = new TextDecoder('latin1').decode(bytes); // one char per byte, so string offsets == byte offsets
        } else throw new Error('PLY: input must be a string, Buffer or ArrayBuffer');

        const end = /^[ \t]*end_header[ \t]*(?:\r\n|\r|\n|$)/m.exec(text);
        if (!end) throw new Error('PLY: missing "end_header" (not a PLY file?)');
        const bodyStart = end.index + end[0].length;
        const h = parseHeader(text.slice(0, end.index));

        let reader;
        if (h.format === 'ascii') reader = asciiReader(text.slice(bodyStart));
        else if (bytes) reader = binaryReader(bytes, bodyStart, h.format === 'binary_little_endian');
        else throw new Error(`PLY: ${h.format} files must be passed as a Buffer/ArrayBuffer, not a string`);

        return readBody(h, reader);
    }

    function parseHeader(headerText) {
        const lines = headerText.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length || lines[0].split(/\s+/)[0] !== 'ply') throw new Error('PLY: file does not start with "ply"');
        let format = null, el = null;
        const elements = [];

        for (const line of lines.slice(1)) {
            const tok = line.split(/\s+/);
            if (tok[0] === 'format') {
                format = tok[1];
                if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(format)) {
                    throw new Error(`PLY: unsupported format "${format}"`);
                }
            } else if (tok[0] === 'element') {
                const count = Number(tok[2]);
                if (!tok[1] || !Number.isInteger(count) || count < 0) throw new Error(`PLY: bad element line "${line}"`);
                elements.push((el = {name: tok[1], count, props: []}));
            } else if (tok[0] === 'property') {
                if (!el) throw new Error(`PLY: property before any element: "${line}"`);
                const list = tok[1] === 'list';
                const typeNames = list ? tok.slice(2, 4) : [tok[1]];
                const name = tok[list ? 4 : 2];
                if (!name) throw new Error(`PLY: bad property line "${line}"`);
                for (const t of typeNames) if (!TYPES[t]) throw new Error(`PLY: unknown type "${t}"`);
                if (list) {
                    const countType = TYPES[typeNames[0]];
                    if (!countType.integer) throw new Error(`PLY: list count type must be integer in "${line}"`);
                    el.props.push({name, list, countType, itemType: TYPES[typeNames[1]]});
                } else {
                    el.props.push({name, list, type: TYPES[typeNames[0]]});
                }
            } // comments, obj_info and unknown keywords are ignored
        }
        if (!format) throw new Error('PLY: missing "format" line');

        const vertexEl = elements.find((e) => e.name === 'vertex');
        if (!vertexEl) throw new Error('PLY: no "vertex" element');
        if (vertexEl.count > 0) {
            for (const c of ['x', 'y', 'z']) {
                const p = vertexEl.props.find((q) => q.name === c);
                if (!p) throw new Error(`PLY: vertex element has no "${c}" property`);
                if (p.list) throw new Error(`PLY: vertex property "${c}" must not be a list`);
            }
        }
        const vnames = vertexEl.props.filter((p) => !p.list).map((p) => p.name);
        const triple = (sets) => sets.find((s) => s.every((n) => vnames.includes(n))) || null;
        const faceEl = elements.find((e) => e.name === 'face') || null;
        const faceList = faceEl ? faceEl.props.find((p) => p.list && FACE_LIST_NAMES.includes(p.name)) || null : null;
        if (faceEl && faceEl.count > 0 && !faceList) {
            throw new Error('PLY: face element has no "vertex_indices" list property');
        }

        return {format, elements, vertexEl, faceList, normalNames: triple(NORMAL_NAMES), colorNames: triple(COLOR_NAMES)};
    }

    /** Whitespace-separated tokens (any line endings). */
    function asciiReader(body) {
        body = body.trim();
        const toks = body ? body.split(/\s+/) : [];
        let i = 0;
        return {
            num() {
                if (i >= toks.length) throw new Error('unexpected end of file');
                const s = toks[i++], v = +s;
                if (v !== v && !/^[+-]?nan$/i.test(s)) throw new Error(`invalid number "${s.slice(0, 40)}"`);
                return v;
            },
            skip(type, count) {
                if ((i += count) > toks.length) throw new Error('unexpected end of file');
            },
            finish() {
                if (i < toks.length) throw new Error('PLY: extra data after the last element (element counts in the header may be wrong)');
            },
        };
    }

    function binaryReader(bytes, off, le) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const len = bytes.byteLength;
        return {
            num(type) {
                if (off + type.size > len) throw new Error('unexpected end of file');
                const v = dv[type.get](off, le);
                off += type.size;
                return v;
            },
            skip(type, count) {
                if ((off += count * type.size) > len) throw new Error('unexpected end of file');
            },
            finish() {},
        };
    }

    function readBody(h, r) {
        const n = h.vertexEl.count;
        const vertices = [], normals = [], colors = [], faces = [];
        // Destination [array, component] for each vertex property, or null to discard it.
        const slots = h.vertexEl.props.map((p) => {
            if (p.list) return null;
            for (const [arr, names] of [[vertices, ['x', 'y', 'z']], [normals, h.normalNames], [colors, h.colorNames]]) {
                const c = names ? names.indexOf(p.name) : -1;
                if (c >= 0) return [arr, c];
            }
            return null;
        });

        let el, e = 0;
        try {
            for (el of h.elements) {
                const isVertex = el === h.vertexEl, props = el.props;
                if (isVertex) {
                    for (let i = 0; i < n; i++) {
                        vertices.push([0, 0, 0]);
                        if (h.normalNames) normals.push([0, 0, 0]);
                        if (h.colorNames) colors.push([0, 0, 0]);
                    }
                }
                for (e = 0; e < el.count; e++) {
                    for (let k = 0; k < props.length; k++) {
                        const p = props[k];
                        if (!p.list) {
                            const v = r.num(p.type), s = isVertex && slots[k];
                            if (s) s[0][e][s[1]] = v;
                            continue;
                        }
                        const count = r.num(p.countType);
                        if (!Number.isInteger(count) || count < 0) throw new Error(`invalid list length ${count}`);
                        if (p !== h.faceList) { r.skip(p.itemType, count); continue; }
                        const face = new Array(count);
                        for (let i = 0; i < count; i++) {
                            const v = (face[i] = r.num(p.itemType));
                            if (!(v >= 0 && v < n && Number.isInteger(v))) {
                                throw new Error(`vertex index ${v} out of range (only ${n} vertices)`);
                            }
                        }
                        faces.push(face);
                    }
                }
            }
        } catch (err) {
            throw new Error(`PLY: ${err.message} in ${el.name} ${e}`);
        }
        r.finish();

        const bad = vertices.findIndex((v) => !v.every(Number.isFinite));
        if (bad >= 0) throw new Error(`PLY: vertex ${bad} has a non-finite coordinate`);

        return {vertices, faces, colors, normals};
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = parsePlyData;
    } else {
        globalThis.parsePlyData = parsePlyData;
    }
})();
