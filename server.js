import express from "express";
import fs from "fs";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Configuration } from "./utils/DBClient.js";
import { loadMensajes, generarIncidencias } from "./functions.js";
const app = express();
const PORT = 1111;
app.use(cors({
  origin: "http://localhost:3000", // permite peticiones desde tu app Next.js
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));
// Necesario si usas módulos ES (type: module)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carpeta donde están los archivos
const FILES_DIR = path.join(__dirname, "exports");
app.use(express.static(path.join(process.cwd(), 'public'))); // sirve /public como /

app.use(express.json());
// 📄 Ruta para listar archivos
app.get("/files", (req, res) => {
  console.log("📂 Listando archivos...");

  fs.readdir(FILES_DIR, (err, files) => {
    if (err) return res.status(500).send("Error leyendo la carpeta");

    // Filtrar solo archivos Excel
    const excelFiles = files.filter(
      file => file.endsWith(".xls") || file.endsWith(".xlsx")
    );

    // Obtener fecha de creación y ordenar (más recientes primero)
    const filesWithStats = excelFiles
      .map(file => {
        const filePath = path.join(FILES_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          createdAt: stats.birthtime, // fecha de creación
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // más reciente arriba

    // Generar la tabla HTML
    const rows = filesWithStats
      .map(
        f => `
          <tr>
            <td>${f.name}</td>
            <td>${f.createdAt.toLocaleString()}</td>
            <td >
              <a href="/download/${f.name}">
                <img src="/download1.svg" style="height:22px;width:22px;cursor:pointer;" alt="Descargar" />
              </a>
            </td>
               <td>
                 <img src="/delete1.svg" style="height:22px;width:22px;cursor:pointer;" alt="Eliminar"
                      onclick="deleteFile('${f.name}')"/>
               </td>
          </tr>`
      )
      .join("");

    res.send(`
        <html>
          <head>
            <meta charset="utf-8"/>
            <title>Archivos Excel</title>
            <style>
              body { font-family: sans-serif; padding: 40px; background: #fafafa; }
              h1 { margin-bottom: 20px; }
              table { border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
              th, td { padding: 12px 16px; border-bottom: 1px solid #eee; }
              th { background: #f3f3f3; text-align: left; }
              tr:hover { background: #f9f9f9; }
            </style>
          </head>
          <body>
          <div style="display:flex;  align-items:center; gap:8px">
                <h1>📊 Archivos disponibles</h1>
                <div style="width: fit-content; cursor:pointer; padding: 12px; border-radius: 12px; background-color: #F1F5F9; display:flex; align-items:center; gap:8px;" onclick="location.reload()">
                  <span>Recargar</span>
                  <img src="/refresh1.svg" style="height:16px;width:16px;" alt="Placeholder" />
                </div>
          </div>
      
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Fecha de creación</th>
                  <th>Descargar</th>
                   <th>Eliminar</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
                    <script>
            async function deleteFile(fileName) {
              if (!confirm("¿Seguro que quieres eliminar " + fileName + "?")) return;
              try {
                const res = await fetch('/delete/' + encodeURIComponent(fileName), { method: 'DELETE' });
                if (res.ok) {
                  
                  alert('Archivo eliminado correctamente');
                    location.reload();
                } else {
                  alert('Error al eliminar el archivo');
                }
              } catch (err) {
                alert('Error: ' + err.message);
              }
            }
          </script>
          </body>
        </html>
      `);
  });
});

app.get("/files/next", (req, res) => {
  console.log("📂 Listando archivos...");

  fs.readdir(FILES_DIR, (err, files) => {
    if (err) return res.status(500).send("Error leyendo la carpeta");

    // Filtrar solo archivos Excel
    const excelFiles = files.filter(
      file => file.endsWith(".xls") || file.endsWith(".xlsx")
    );

    // Obtener fecha de creación y ordenar (más recientes primero)
    const filesWithStats = excelFiles
      .map(file => {
        const filePath = path.join(FILES_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          createdAt: stats.birthtime, // fecha de creación
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // más reciente arriba

    const temporalMessages = loadMensajes();
    const userNames = temporalMessages.map(msg => msg.Usuario);

    const uniqueNames = userNames.filter((name, index) => {
      return userNames.indexOf(name) === index;
    });
    console.log(userNames);
    const data = {
      nextReport: filesWithStats || null,
      personal: uniqueNames,
      messages: temporalMessages.length

    }

    res.json(data);
  });
});

// Actualizar fecha

app.post("/date", async (req, res) => {

  const { day, hour, presentacion, instructions } = req.body

  console.log(day)
  console.log(hour)
  let data = {}
  if (day) {
    data.day = day
  }
  if (hour) {
    data.hour = hour
  }
  if (presentacion) {
    data.presentacion = presentacion
  }
  console.log(presentacion)
  if (instructions) {
    data.instructions = instructions
  }
  const config = await Configuration.update({
    where: { id: 1 },
    data: data
  });
  console.log(config)
  res.json({ message: 'Fecha actualizada' });
})
// Eliminar archivo
app.delete("/delete/:file", (req, res) => {
  const fileName = req.params.file;
  const filePath = path.join(FILES_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Archivo no encontrado");
  }

  fs.unlink(filePath, err => {
    if (err) {
      console.error("❌ Error eliminando archivo:", err);
      return res.status(500).send("Error eliminando el archivo");
    }
    console.log(`🗑️ Archivo eliminado: ${fileName}`);
    res.sendStatus(200);
  });
});

// ⬇️ Ruta para descargar archivos
app.get("/download/:filename", (req, res) => {
  const filePath = path.join(FILES_DIR, req.params.filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send("Archivo no encontrado");
  }
});


app.get('/configuration', async (req, res) => {
  const config = await Configuration.findFirst();
  res.json(config);

}
)


app.get('/generate', async (req, res) => {
  generarIncidencias();
  res.json({ message: 'Generando reporte' });
}
)




app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}/files`));
