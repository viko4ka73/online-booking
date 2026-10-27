import { useEffect, useState } from 'react'
function App() { const [message, setMessage] = useState('')
useEffect(() => { fetch('http://localhost:3000/api/health') .then(res => res.json()) .then(data => setMessage(data.message)) }, [])
return ( <div className="min-h-screen bg-gray-950 text-white p-10"> <h1 className="text-4xl font-bold"> Code Snippets Manager </h1>
  <p className="mt-5">
    Backend: {message}
  </p>
</div>
) }
export default App