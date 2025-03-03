import OverlayChoice from './OverlayChoice';

function ResetProgressOverlay({
	resetProgress,
	closeOverlay,
}: {
	resetProgress: () => Promise<void>;
	closeOverlay: () => void;
}) {
	return (
		<OverlayChoice
			button1={{
				children: 'Reset',
				onClick: () => {
					void resetProgress();
				},
			}}
			button2={{
				children: 'Cancel',
				onClick: closeOverlay,
			}}
			content={
				<>
					<h1> Reset all progress </h1>
					<p>
						{`Warning! This will reset all your progress in the levels and sandbox mode. 
							This includes all your conversation history and sent emails. Any configurations you have made to defences in sandbox mode will also be lost.
							Are you sure you want to do this?`}
					</p>
				</>
			}
			closeOverlay={closeOverlay}
		/>
	);
}

export default ResetProgressOverlay;
