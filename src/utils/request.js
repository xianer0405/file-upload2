export default function request ({
  url,
  method = 'POST',
  data,
  headers = {},
  onProgress = e => e,
  requestList
}) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = onProgress
    xhr.open(method, url)
    Object.keys(headers).forEach((headerName) => {
      xhr.setRequestHeader(headerName, headers[headerName])
    })
    xhr.send(data)
    xhr.onload = e => {
      if (requestList) {
        const xhrIndex = requestList.findIndex(item => item === xhr)
        requestList.splice(xhrIndex, 1)
      }
      resolve({
        data: e.target.response
      })
    }
    requestList?.push(xhr)
  })
}
