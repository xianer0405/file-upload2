// TODO 导入路径 有什么需要注意的吗？
self.importScripts('/spark-md5.min.js')
console.log('web-work hash.js')
self.onmessage = e => {
  console.log('onmessage e=>', e)
  const { fileChunks } = e.data
  const spark = new self.SparkMD5.ArrayBuffer()
  let percentage = 0
  let count = 0
  const loadNext = index => {
    const reader = new FileReader()
    reader.readAsArrayBuffer(fileChunks[index].fileChunk)
    reader.onload = e => {
      count ++
      spark.append(e.target.result)
      if (count === fileChunks.length) {
        self.postMessage({
          percentage: 100,
          hash: spark.end()
        })
        self.close()
      } else {
        percentage += 100 / fileChunks.length
        self.postMessage({
          percentage
        })
        loadNext(count)
      }
    }
  }
  loadNext(0)
}
