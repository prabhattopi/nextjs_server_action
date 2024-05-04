import React from 'react'
import ChatContent from './ChatContent'


const Chat = () => {
    const message=[
        {
            id:"sdjfksjf",
            role:"system",
            content:"you are my assistant give me short answer"

        },
        {
            id:"sdjfksjffds",
            role:"user",
            content:"hi"

        },
        {
            id:"sdjfksjf4234234",
            role:"assistant",
            content:"Hello ! how can i help you today"

        },

    ]
  return (
    <div className='container'>
       <div className="chat_container">
        {
            message.map(m=>(
                <ChatContent key={m.id} m={m}/>
            ))
        }
       </div>
       <div className="typing">
        <div className="typing_box">
            <form action="">
                <textarea required placeholder='Ask Ai Anything...'/>
                <button className='material-symbols-outlined'>
                    send
                </button>
            </form>
            <div className="typing_controls">
                <span className='material-symbols-outlined'>light_mode</span>
                <span className='material-symbols-outlined'>
                    delete
                </span>
                
            </div>
        </div>
       </div>

    </div>
  )
}

export default Chat