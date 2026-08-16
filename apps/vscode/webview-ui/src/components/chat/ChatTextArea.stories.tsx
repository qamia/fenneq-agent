import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import ChatTextArea from "./ChatTextArea"

const meta: Meta<typeof ChatTextArea> = {
	title: "Views/ChatTextArea",
	component: ChatTextArea,
}
export default meta

const Harness = () => {
	const [inputValue, setInputValue] = useState("")
	const [selectedImages, setSelectedImages] = useState<string[]>([])
	const [selectedFiles, setSelectedFiles] = useState<string[]>([])
	return (
		<div style={{ maxWidth: 400 }}>
			<ChatTextArea
				activeQuote={null}
				inputValue={inputValue}
				onSelectFilesAndImages={() => {}}
				onSend={() => {}}
				placeholderText="Type your task here..."
				selectedFiles={selectedFiles}
				selectedImages={selectedImages}
				sendingDisabled={false}
				setInputValue={setInputValue}
				setSelectedFiles={setSelectedFiles}
				setSelectedImages={setSelectedImages}
				shouldDisableFilesAndImages={false}
			/>
		</div>
	)
}

export const Default: StoryObj<typeof ChatTextArea> = {
	render: () => <Harness />,
}
