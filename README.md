#### PLYParser
PLYParser is a javascript library that parses PLY (Polygon File Format) files. 

It supports `ascii`, `binary_little_endian` and `binary_big_endian` files. Parsing is driven by the
header, so vertices can have any properties in any order, and extra elements (edges, materials, ...) are skipped.

`parsePlyData(data)` takes the file contents (a string for ascii files, or a `Buffer` / `ArrayBuffer` /
typed array for any format) and returns:

- `vertices`: `[[x, y, z], ...]`
- `faces`: `[[i0, i1, i2, ...], ...]`, polygons with any number of vertices, as stored in the file
- `colors`: `[[r, g, b], ...]`, raw values as stored (e.g. 0-255 for `uchar`); `[]` if the file has no colors
- `normals`: `[[nx, ny, nz], ...]`; `[]` if the file has no normals

It throws an `Error` with a readable message for malformed files (bad header, missing or extra data,
invalid numbers, face indices out of range).

Read files without an encoding (`fs.readFileSync(path)`) so binary files work too.

###### EXAMPLE USAGE

###### Installing and Using with npm
```
npm install plyparser@latest

// Require the package in your code:
const plyParser = require('plyparser');

```

###### Using in the browser
```
// add a script tag 
<script src="https://unpkg.com/plyparser@latest/PLYParser.js" type="text/javascript"></script>
```


###### Sample usage can be seen in the file sampleUsage.js
```nodejs
const fs = require('fs');
// const parsePlyData = require('./PLYParser')
const parsePlyData = require('plyparser')
const filePath = 'cube.ply';
const data = fs.readFileSync(filePath);
const result = parsePlyData(data);

console.log("vertices", result.vertices)
console.log("faces", result.faces)
console.log("colors", result.colors)
console.log("normals", result.normals)
console.log(`Vertices Length = ${result.vertices.length}`)
console.log(`Faces Length = ${result.faces.length}`)

```
###### to run do ```node sampleUsage.js```  Which will show an output that looks like this:

```text
vertices [
  [ -1, -1, 1 ],
  [ -1, 1, 1 ],
  [ -1, 1, -1 ],
  [ 1, 1, 1 ],
  [ 1, 1, -1 ],
  [ 1, -1, 1 ],
  [ 1, -1, -1 ],
  [ -1, -1, -1 ]
]
faces [
  [ 0, 1, 2 ], [ 1, 3, 4 ],
  [ 3, 5, 6 ], [ 0, 7, 5 ],
  [ 7, 2, 4 ], [ 5, 3, 1 ],
  [ 7, 0, 2 ], [ 2, 1, 4 ],
  [ 4, 3, 6 ], [ 5, 7, 6 ],
  [ 6, 7, 4 ], [ 0, 5, 1 ]
]
colors []
normals []
Vertices Length = 8
Faces Length = 12
```

##### Tests
```
nyc mocha PLYParserTest.js
```

#### Test Results
```
  PLYParser
    ✔ should parse PLY data with vertices and faces
    ✔ should parse PLY data with vertices, colors, and faces
    ✔ should correctly distinguish and count lines that represent vertices and faces
    ✔ should correctly distinguish and handle face lines that start with 4
    ✔ should parse faces with any number of vertices
    ✔ should parse PLY data with no vertices or faces
    ✔ should parse a point cloud with no face element
    ✔ should handle PLY data with invalid format
    ✔ should reject data that is not a PLY file
    ✔ should handle incomplete vertex data
    ✔ should handle incomplete face data
    ✔ should reject extra data after the last element
    ✔ should reject face indices that are out of range
    ✔ should reject invalid numbers
    ✔ should parse PLY colors data if it is described in the header
    ✔ should not parse colors if color property is not described in the header
    ✔ should parse PLY data with vertices, colors, faces
    ✔ should handle PLY data with negative coordinates
    ✔ should parse scientific notation and numbers without a leading digit
    ✔ should handle any vertex layout, normals and extra properties and elements
    ✔ should handle CRLF and CR line endings
    ✔ should parse binary_little_endian files
    ✔ should parse binary_big_endian files
    ✔ should explain that binary files must be passed as bytes
    ✔ should parse cube.ply

  25 passing (7ms)
```
