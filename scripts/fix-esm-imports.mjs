import fs from "fs";
import path from "path";

function getTSFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getTSFiles(file));
    } else if (file.endsWith(".ts")) {
      results.push(file);
    }
  });
  return results;
}

const dirs = ["C:/bc-proje/Seovista/packages/content-models/src", "C:/bc-proje/Seovista/packages/seo-core/src"];
for (const dir of dirs) {
    const files = getTSFiles(dir);
    for (const file of files) {
    let content = fs.readFileSync(file, "utf8");
    const newContent = content.replace(/(import|export)\s+(.*?)\s+from\s+[\"'](\.[^\"']+)[\"']/gs, (match, type, contentInside, target) => {
        if (!target.endsWith('.js')) {
        return `${type} ${contentInside} from "${target}.js"`;
        }
        return match;
    });
    const newContent2 = newContent.replace(/(import|export)\s+[\"'](\.[^\"']+)[\"']/g, (match, type, target) => {
        if (!target.endsWith('.js')) {
        return `${type} "${target}.js"`;
        }
        return match;
    });
    if (content !== newContent2) {
        fs.writeFileSync(file, newContent2, "utf8");
        console.log("Updated " + file);
    }
    }
}
