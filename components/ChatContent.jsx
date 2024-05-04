import React from 'react'
import USER from "@/images/user.jpg"
import BOT from "@/images/bot.jpg"
import Image from 'next/image'
const ChatContent = ({m}) => {
  return (
    <div className={`chat ${m.role}`}>
      <div className="chat_content">
        <div className="chat_messages">
          <Image
          src={m.role==="user"?USER:BOT}
          width={35}
          height={35}
          alt={m.role==="user"?USER:BOT}
          />
          <p>{m.content}</p>
        </div>
        <span className='material-symbols-outlined copy'>
          content_copy
        </span>
      </div>

    </div>
  )
}

export default ChatContent