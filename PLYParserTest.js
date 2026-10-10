const {expect} = require('chai');
const parsePlyData = require('./PLYParser');
const fs = require('fs');

// Build a binary PLY: header text followed by values written with the given DataView setters.
function binaryPly(header, values, littleEndian) {
    const sizes = {setInt8: 1, setUint8: 1, setInt16: 2, setUint16: 2, setInt32: 4, setUint32: 4, setFloat32: 4, setFloat64: 8};
    const head = Buffer.from(header, 'latin1');
    const body = new DataView(new ArrayBuffer(values.reduce((s, [set]) => s + sizes[set], 0)));
    let off = 0;
    for (const [set, v] of values) {
        body[set](off, v, littleEndian);
        off += sizes[set];
    }
    return Buffer.concat([head, Buffer.from(body.buffer)]);
}

describe('PLYParser', () => {
    it('should parse PLY data with vertices and faces', () => {
        const data = `ply
format ascii 1.0
comment Some comment
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
1.0 2.0 3.0
4.0 5.0 6.0
7.0 8.0 9.0
3 0 1 2`;

        const result = parsePlyData(data);

        expect(result.vertices).to.have.lengthOf(3);
        expect(result.faces).to.have.lengthOf(1);
        expect(result.colors).to.have.lengthOf(0);
        expect(result.normals).to.have.lengthOf(0);
    });

    it('should parse PLY data with vertices, colors, and faces', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 1
property list uchar int vertex_indices
end_header
1.0 2.0 3.0 255 0 0
4.0 5.0 6.0 0 255 0
7.0 8.0 9.0 0 0 255
3 0 1 2`;

        const result = parsePlyData(data);

        expect(result.vertices).to.have.lengthOf(3);
        expect(result.faces).to.have.lengthOf(1);
        expect(result.colors).to.have.lengthOf(3);
    });

    it('should correctly distinguish and count lines that represent vertices and faces', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 3
property list uchar int vertex_indices
end_header
1.0 2.0 3.0
4.0 5.0 6.0
7.0 8.0 9.0
3 2 1 0
3 2 0 1
3 1 2 0
`;

        const result = parsePlyData(data);
        expect(result.vertices).to.deep.equal([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
        expect(result.faces).to.deep.equal([[2, 1, 0], [2, 0, 1], [1, 2, 0]]);
        expect(result.colors).to.have.lengthOf(0);
    });

    it('should correctly distinguish and handle face lines that start with 4', () => {
        const data = `ply
    format ascii 1.0
    element vertex 4
    property float x
    property float y
    property float z
    element face 3
    property list uchar int vertex_indices
    end_header
    1.0 2.0 3.0
    4.0 5.0 6.0
    7.0 8.0 9.0
    3.0 4.0 5.0
    4 2 1 0 3
    4 2 0 3 1
    4 1 2 3 0
    `;

        const result = parsePlyData(data);
        expect(result.vertices).to.deep.equal([[1, 2, 3], [4, 5, 6], [7, 8, 9], [3, 4, 5]]);
        expect(result.faces).to.deep.equal([[2, 1, 0, 3], [2, 0, 3, 1], [1, 2, 3, 0]]);
        expect(result.colors).to.have.lengthOf(0);
    });

    it('should parse faces with any number of vertices', () => {
        const data = `ply
format ascii 1.0
element vertex 6
property float x
property float y
property float z
element face 2
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
2 1 0
1 2 0
0 2 0
-1 1 0
6 0 1 2 3 4 5
5 5 4 3 2 1`;

        const result = parsePlyData(data);
        expect(result.faces).to.deep.equal([[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1]]);
    });

    it('should parse PLY data with no vertices or faces', () => {
        const data = `ply
format ascii 1.0
element vertex 0
element face 0
end_header`;

        const result = parsePlyData(data);

        expect(result.vertices).to.have.lengthOf(0);
        expect(result.faces).to.have.lengthOf(0);
        expect(result.colors).to.have.lengthOf(0);
    });

    it('should parse a point cloud with no face element', () => {
        const data = `ply
format ascii 1.0
element vertex 2
property float x
property float y
property float z
end_header
1 2 3
4 5 6`;

        const result = parsePlyData(data);
        expect(result.vertices).to.deep.equal([[1, 2, 3], [4, 5, 6]]);
        expect(result.faces).to.deep.equal([]);
    });

    it('should handle PLY data with invalid format', () => {
        const invalidFormatData = `ply
format binary 1.0
element vertex 3
property float x
property float y
property float z
end_header
1.0 2.0 3.0
4.0 5.0 6.0
7.0 8.0 9.0`;

        expect(() => parsePlyData(invalidFormatData)).to.throw('PLY: unsupported format "binary"');
    });

    it('should reject data that is not a PLY file', () => {
        expect(() => parsePlyData('hello world')).to.throw('PLY: missing "end_header"');
        expect(() => parsePlyData('format ascii 1.0\nend_header\n')).to.throw('PLY: file does not start with "ply"');
    });

    it('should handle incomplete vertex data', () => {
        const incompleteVertexData = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
end_header
1.0 2.0 3.0
4.0 5.0 6.0`;

        expect(() => parsePlyData(incompleteVertexData)).to.throw('PLY: unexpected end of file in vertex 2');
    });

    it('should handle incomplete face data', () => {
        const incompleteFaceData = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 2
property list uchar int vertex_indices
end_header
1.0 2.0 3.0
4.0 5.0 6.0
7.0 8.0 9.0
3 0 1 2`;

        expect(() => parsePlyData(incompleteFaceData)).to.throw('PLY: unexpected end of file in face 1');
    });

    it('should reject extra data after the last element', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
end_header
1.0 2.0 3.0 255 0 0
4.0 5.0 6.0 0 255 0
7.0 8.0 9.0 0 0 255`;

        expect(() => parsePlyData(data)).to.throw('PLY: extra data after the last element');
    });

    it('should reject face indices that are out of range', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
1 2 3
4 5 6
7 8 9
3 0 1 3`;

        expect(() => parsePlyData(data)).to.throw('PLY: vertex index 3 out of range (only 3 vertices) in face 0');
    });

    it('should reject invalid numbers', () => {
        const data = `ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
end_header
1 abc 3`;

        expect(() => parsePlyData(data)).to.throw('PLY: invalid number "abc" in vertex 0');
    });

    it('should parse PLY colors data if it is described in the header', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 1
property list uchar int vertex_indices
end_header
1.0 2.0 3.0 255 0 0
4.0 5.0 6.0 0 255 0
7.0 8.0 9.0 0 0 255
3 0 1 2`;

        const result = parsePlyData(data);

        expect(result.vertices).to.have.lengthOf(3);
        expect(result.faces).to.have.lengthOf(1);
        expect(result.colors).to.deep.equal([[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
    });

    it('should not parse colors if color property is not described in the header', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
property uchar alpha
property uchar red
property uchar green
element face 1
property list uchar int vertex_indices
end_header
1.0 2.0 3.0 255 0 0
4.0 5.0 6.0 0 255 0
7.0 8.0 9.0 0 0 255
3 0 1 2`;

        const result = parsePlyData(data);

        expect(result.vertices).to.deep.equal([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
        expect(result.faces).to.have.lengthOf(1);
        expect(result.colors).to.deep.equal([]);
    });

    it('should parse PLY data with vertices, colors, faces', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 1
property list uchar int vertex_indices
end_header
1.0 2.0 3.0 255 255 0
4.0 5.0 6.0 128 128 128
7.0 8.0 9.0 0 0 0
3 0 1 2`;

        const result = parsePlyData(data);

        expect(result.vertices).to.have.lengthOf(3);
        expect(result.faces).to.have.lengthOf(1);
        expect(result.colors).to.deep.equal([[255, 255, 0], [128, 128, 128], [0, 0, 0]]);
    });

    it('should handle PLY data with negative coordinates', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
-1.0 -2.0 -3.0
-4.0 -5.0 -6.0
-7.0 -8.0 -9.0
3 0 1 2`;

        const result = parsePlyData(data);
        expect(result.vertices).to.deep.equal([[-1, -2, -3], [-4, -5, -6], [-7, -8, -9]]);
        expect(result.faces).to.have.lengthOf(1);
        expect(result.colors).to.have.lengthOf(0);
    });

    it('should parse scientific notation and numbers without a leading digit', () => {
        const data = `ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
end_header
1e-3 .5 -2.5E+2`;

        expect(parsePlyData(data).vertices).to.deep.equal([[0.001, 0.5, -250]]);
    });

    it('should handle any vertex layout, normals and extra properties and elements', () => {
        const data = `ply
format ascii 1.0
element vertex 3
property float confidence
property float z
property float nx
property float ny
property float nz
property float x
property uchar blue
property float y
property uchar green
property uchar red
property list uchar int extra_list
element face 1
property uchar flags
property list uchar int vertex_indices
property float quality
element edge 1
property int vertex1
property int vertex2
end_header
0.9 3 0 0 1 1 30 2 20 10 2 7 7
0.8 6 0 1 0 4 31 5 21 11 0
0.7 9 1 0 0 7 32 8 22 12 1 5
1 3 0 1 2 0.5
0 1`;

        const result = parsePlyData(data);
        expect(result.vertices).to.deep.equal([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
        expect(result.normals).to.deep.equal([[0, 0, 1], [0, 1, 0], [1, 0, 0]]);
        expect(result.colors).to.deep.equal([[10, 20, 30], [11, 21, 31], [12, 22, 32]]);
        expect(result.faces).to.deep.equal([[0, 1, 2]]);
    });

    it('should handle CRLF and CR line endings', () => {
        const lines = ['ply', 'format ascii 1.0', 'element vertex 3', 'property float x', 'property float y',
            'property float z', 'element face 1', 'property list uchar int vertex_indices', 'end_header',
            '1 2 3', '4 5 6', '7 8 9', '3 0 1 2'];
        for (const eol of ['\r\n', '\r']) {
            const result = parsePlyData(lines.join(eol));
            expect(result.vertices).to.deep.equal([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
            expect(result.faces).to.deep.equal([[0, 1, 2]]);
        }
    });

    for (const [format, littleEndian] of [['binary_little_endian', true], ['binary_big_endian', false]]) {
        it(`should parse ${format} files`, () => {
            const header = `ply
format ${format} 1.0
element vertex 3
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 1
property list uchar int vertex_indices
end_header
`;
            const values = [];
            [[1, 2, 3, 255, 0, 0], [4, 5, 6, 0, 255, 0], [7, 8, 9, 0, 0, 255]].forEach(([x, y, z, r, g, b]) => {
                values.push(['setFloat32', x], ['setFloat32', y], ['setFloat32', z],
                    ['setUint8', r], ['setUint8', g], ['setUint8', b]);
            });
            values.push(['setUint8', 3], ['setInt32', 0], ['setInt32', 1], ['setInt32', 2]);
            const buffer = binaryPly(header, values, littleEndian);

            for (const input of [buffer, new Uint8Array(buffer).buffer]) {
                const result = parsePlyData(input);
                expect(result.vertices).to.deep.equal([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
                expect(result.colors).to.deep.equal([[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
                expect(result.faces).to.deep.equal([[0, 1, 2]]);
            }
            expect(() => parsePlyData(buffer.subarray(0, buffer.length - 2))).to.throw('PLY: unexpected end of file in face 0');
        });
    }

    it('should explain that binary files must be passed as bytes', () => {
        const data = `ply
format binary_little_endian 1.0
element vertex 0
end_header
`;
        expect(() => parsePlyData(data)).to.throw('must be passed as a Buffer/ArrayBuffer');
    });

    it('should parse cube.ply', () => {
        const result = parsePlyData(fs.readFileSync(__dirname + '/cube.ply'));
        expect(result.vertices).to.have.lengthOf(8);
        expect(result.faces).to.have.lengthOf(12);
        expect(result.vertices[0]).to.deep.equal([-1, -1, 1]);
        expect(result.faces[0]).to.deep.equal([0, 1, 2]);
    });
});
