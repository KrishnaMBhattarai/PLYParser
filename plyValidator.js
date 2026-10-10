const fs = require('fs');
const path = require('path');
// const parsePlyData = require('plyparser');
const parsePlyData = require('./PLYParser')
const directoryPath = '.';

fs.readdir(directoryPath, (err, files) => {
  if (err) {
    console.error('Error reading directory:', err);
    return;
  }

  files.forEach((file) => {
    if (path.extname(file) === '.ply') {
      const filePath = path.join(directoryPath, file);
      const data = fs.readFileSync(filePath);
      console.log(`File: ${file}`);
      const result = parsePlyData(data);

      // console.log("vertices", result.vertices)
      // console.log("faces", result.faces)
      // console.log("colors", result.colors)

      console.log(`Vertices Length = ${result.vertices.length}`);
      console.log(`Faces Length = ${result.faces.length}`);
      console.log(`Colors Length = ${result.colors.length}`);
      console.log(`Normals Length = ${result.normals.length}`);
      console.log('\n');
    }
  });
});