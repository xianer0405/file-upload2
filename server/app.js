const http = require('http')
const fse = require('fs-extra')
const path = require('path')
const multiparty = require('multiparty')

const UPLOAD_DIR = path.resolve(__dirname, "..", "target")

// 提取文件后缀名
const extractExt = filename => filename.slice(filename.lastIndexOf('.'), filename.length)
const resolvePost = req => {
    return new Promise(resolve => {
        let chunk = "";
        req.on('data', data => {
            chunk += data
        })
        req.on('end', async () => {
            resolve(JSON.parse(chunk))
        })
    })
}

// 获取已经上传成功的chunk文件
const loadUploadedChunks = async fileHash => {
    const chunks = fse.existsSync(path.resolve(UPLOAD_DIR, fileHash))
        ? await fse.readdir(path.resolve(UPLOAD_DIR, fileHash))
        : []
    console.log('loadUploadedChunks =>', chunks)
    return chunks
}

const server = http.createServer()
server.on('request', async (req, res) => {
    console.log('server/app on request, url=>', req.url)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    if (req.method === 'OPTIONS') {
        res.status = 200
        res.end()
        return
    }

    if (req.url === '/verify') {
        console.log('server/app verify start...')
        const data = await resolvePost(req)
        const { fileHash, filename } = data
        const ext = extractExt(filename)
        const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`)
        const uploadedChunks = await loadUploadedChunks(fileHash)
        const exists = fse.existsSync(filePath)
        let result = { exists, uploadedChunks }
        console.log('server/app verify end')
        res.end(JSON.stringify(result))
    }

    if (req.url === '/fileUpload') {
        const multipartyForm = new multiparty.Form()
        multipartyForm.parse(req, async (err, fields, files) => {
            try {
                if (err) {
                    console.error('multipartyForm.parse err=>', err)
                    return
                }
                console.log('server/app fileUpload start...')
                // 获取请求数据和文件数据
                // console.log('multipartyForm.parse, fields, files=>', fields, files)
                const [chunk] = files.chunk // file chunk
                const [chunkHash] = fields.chunkHash // ${filehash}-index
                const [filename] = fields.filename // 文件名称
                const [fileHash] = fields.fileHash // 文件名称
                // 初始化文     件存储目录， 以上传的文件名称为目录
                // TODO 这里要考虑文件名称长度超长问题
                const chunkDir = `${UPLOAD_DIR}/${fileHash}`
                if (!fse.existsSync(chunkDir)) {
                    await fse.mkdirs(chunkDir)
                }
        
                // 将临时文件转存到存储目录
                await fse.move(chunk.path, `${chunkDir}/${chunkHash}`)
            } catch (error) {
                console.error('fileUpload error=>', error)
            }
            console.log('server/app fileUpload end')
            res.end(JSON.stringify({code: 0, message: 'file upload success'}))
        })
    }

    if (req.url === '/mergeChunks') {
        console.log('mergeChunks start...')
        try {
            const { fileHash, filename } = await resolvePost(req)
            await mergeFileChunks(fileHash, filename);
            res.end(JSON.stringify({
                code: 0,
                message: 'file merge success'
            }))
        } catch (error) {
            console.error('mergeChunks error=>', error)
        }
        console.log('mergeChunks end')
        return
    }
})

const mergeFileChunks = async (fileHash, filename) => {
    try {
        const filepath = `${UPLOAD_DIR}/${fileHash}`
        const chunkFilePaths = await fse.readdir(filepath)
        const ext = extractExt(filename)
        const storeFilePath  = `${UPLOAD_DIR}/${fileHash}${ext}`
        await fse.writeFile(storeFilePath, '')
        chunkFilePaths.forEach( chunkFilePath => {
            let chunkFileFullPath = `${UPLOAD_DIR}/${fileHash}/${chunkFilePath}`
            fse.appendFileSync(storeFilePath, fse.readFileSync(chunkFileFullPath))
            fse.unlinkSync(chunkFileFullPath)
        })
        fse.rmdirSync(`${UPLOAD_DIR}/${fileHash}`)
    } catch (error) {
        console.error('mergeFileChunks error=>', error)
    }
}

server.listen(3000, () => {
    console.log('server is running on 3000 port')
})