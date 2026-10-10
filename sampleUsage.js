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
