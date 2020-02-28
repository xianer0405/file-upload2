<template>
  <div class="FileUploadDemo">
    <h3>大文件上传解决方案（分片上传，支持断点续传）</h3>
    <hr/>
    <input type="file" @change="handleFileChange"/>
    <el-button type="primary" @click="handleFileUpload" :disabled="!canUplad">上传</el-button>
    <el-button type="primary" @click="handlePause" :disabled="!canPause">暂停</el-button>
    <el-button @click="handleResume" v-if="isPaused">恢复</el-button>
    <h3>计算Hash进度: {{container.fileHash}}</h3>
    <el-progress :percentage="hashPercentage"></el-progress>
    <h3>总进度</h3>
    <el-progress :percentage="fakeUploadPercentage"></el-progress>
    <el-table
      :data="data"
      style="width: 100%">
      <el-table-column
        prop="chunkHash"
        label="切片(hash)"
        width="300">
      </el-table-column>
      <el-table-column
        prop="chunk.size"
        label="大小(KB)"
        width="200">
      </el-table-column>
      <el-table-column
        label="进度">
        <template slot-scope="scope">
          <el-progress :percentage="scope.row.percentage"></el-progress>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script type="text/ecmascript-6">
import request from '../utils/request'
// TODO 统统分10个切换，是否合理
const LEN = 10

export default {
  data () {
    return {
      isPaused: false,
      isResuming: false,
      container: {
        file: null,
        fileHash: '',
        worker: null
      },
      hashPercentage: 0,
      data: [],
      requestList: [],
      fakeUploadPercentage: 0
    }
  },
  computed: {
    canUplad () {
      return this.container.file && !this.isResuming && !this.isPaused
    },
    canPause () {
      return this.requestList.length && !this.isResuming
    },
    uploadPercentage () {
      if (!this.container.file || !this.data.length) return 0
      const loaded = this.data
        .map(item => item.chunk.size * item.percentage)
        .reduce((acc, cur) => acc + cur)
      return parseInt((loaded / this.container.file.size).toFixed(2))
    }
  },
  watch: {
    uploadPercentage (now) {
      if (now > this.fakeUploadPercentage) {
        this.fakeUploadPercentage = now
      }
    }
  },
  methods: {
    async handleResume () {
      this.isResuming = true
      const { uploadedChunks } = await this.verifyUpload(
        this.container.file.name,
        this.container.fileHash
      )
      await this.uploadChunks(uploadedChunks)
    },
    handlePause () {
      this.isPaused = true
      this.requestList.forEach(xhr => xhr?.abort())
      this.requestList = []
    },
    // 监听UI上file input的文件变化
    handleFileChange (e) {
      const [file] = e.target.files
      if (!file) {
        this.container.file = null
        this.data = []
        return
      }
      console.log('file type is ', Object.prototype.toString.call(file))
      // 什么鬼
      Object.assign(this.$data, this.$options.data())
      this.container.file = file
    },
    async verifyUpload (filename, fileHash) {
      const { data } = await request({
        url: 'http://localhost:3000/verify',
        data: JSON.stringify({ filename, fileHash }),
        headers: { 'content-type': 'application/json' }
      })
      return JSON.parse(data)
    },
    async handleFileUpload () {
      // 1. 创建文件切片
      const fileChunks = this.createFileChunks()
      this.container.fileHash = await this.calculateHash(fileChunks)
      const { exists, uploadedChunks = [] } = await this.verifyUpload(this.container.file.name, this.container.fileHash)
      if (exists) {
        this.fakeUploadPercentage = 100
        this.$message.success('秒传：上传成功')
        return
      }
      // 2. 构建数据
      this.data = fileChunks.map(({ fileChunk }, index) => {
        const chunkHash = this.container.fileHash + '-' + index
        return {
          fileHash: this.container.fileHash,
          chunk: fileChunk,
          chunkHash,
          index,
          percentage: uploadedChunks.includes(chunkHash) ? 100 : 0
        }
      })
      // 3. 上传文件切片
      await this.uploadChunks(uploadedChunks)
    },
    calculateHash (fileChunks) {
      return new Promise(resolve => {
        // TODO 引用路径 有什么规则
        this.container.worker = new Worker('/hash.js')
        this.container.worker.postMessage({ fileChunks })
        this.container.worker.onmessage = e => {
          console.log('upload demo message=>', e)
          const { percentage, hash } = e.data
          this.hashPercentage = percentage
          !!hash && resolve(hash)
        }
      })
    },
    createFileChunks () {
      // 接口File --> Blob
      const file = this.container.file
      const fileChunks = []
      const chunkSize = Math.ceil(file.size / LEN)
      let startPos = 0
      while (startPos < file.size) {
        // 当startPos + chunkSize超出了原始Blob的长度，那么返回的Blob对象将会包含从startPos到原始数据的末尾
        fileChunks.push({ fileChunk: file.slice(startPos, startPos + chunkSize) })
        startPos += chunkSize
      }
      return fileChunks
    },
    async uploadChunks (uploadedChunks = []) {
      const requestList = this.data.filter(({ chunkHash }) => {
        return !uploadedChunks.includes(chunkHash)
      }).map(({ chunk, chunkHash, index }) => {
        const formData = new FormData()
        formData.append('chunk', chunk)
        formData.append('chunkHash', chunkHash)
        formData.append('fileHash', this.container.fileHash)
        formData.append('filename', this.container.file.name)
        return { formData, index }
      }).map(async ({ formData, index }) => { // TODO 这里确定需要async吗？
        return request({
          url: 'http://localhost:3000/fileUpload',
          data: formData,
          onProgress: this.createProgressHandler(this.data[index]),
          requestList: this.requestList
        })
      })
      // 发送切片
      await Promise.all(requestList)
      // 发送合并切片请求
      if (uploadedChunks.length + requestList.length === this.data.length) {
        await this.mergeChunksRequest()
      }
    },
    async mergeChunksRequest () {
      await request({
        url: 'http://localhost:3000/mergeChunks',
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify({ filename: this.container.file.name, fileHash: this.container.fileHash })
      })
      this.$message.success('上传成功')
      this.isResuming = false
      this.isPaused = false
    },
    createProgressHandler (item) {
      return e => {
        console.log(e)
        item.percentage = parseInt(String((e.loaded / e.total) * 100))
      }
    }
  }
}
</script>

<style lang="less">
.FileUploadDemo {
  width: 100%;

  h3 {
    text-align: left;
  }
}
</style>
