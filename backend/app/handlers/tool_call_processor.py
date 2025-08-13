"""
Handles tool call processing and execution.
"""

import traceback
from typing import Dict, Any, Callable, List

from google.genai import types


class ToolCallProcessor:
    """Processes tool calls from Gemini Live API."""
    
    def __init__(self, session, available_functions: Dict[str, Callable]):
        self.session = session
        self.available_functions = available_functions
    
    async def process_tool_call(self, tool_call):
        """Process tool call from Gemini."""
        print(f"\\033[92mBackend: Received tool_call from Gemini: {tool_call}\\033[0m")
        
        function_responses = []
        
        for fc in tool_call.function_calls:
            print(f"\\033[92mBackend: Gemini requests function call: {fc.name} with args: {dict(fc.args)}\\033[0m")
            
            function_response = await self._execute_function_call(fc)
            function_responses.append(function_response)
        
        if function_responses:
            print(f"\\033[92mBackend: Sending {len(function_responses)} function response(s) to Gemini.\\033[0m")
            await self.session.send_tool_response(function_responses=function_responses)
        else:
            print("Backend: No function responses generated for tool_call.")
    
    async def _execute_function_call(self, fc) -> types.FunctionResponse:
        """Execute a single function call."""
        function_to_call = self.available_functions.get(fc.name)
        function_response_content = None
        
        if function_to_call:
            try:
                function_args = dict(fc.args)
                print(f"\\033[92mBackend: Calling function {fc.name} with args: {function_args}\\033[0m")
                
                # Execute the function
                result = await function_to_call(**function_args)
                
                if isinstance(result, str):
                    function_response_content = {"content": result}
                else:
                    # Assume result is already a dict if not a string
                    function_response_content = result
                
                print(f"\\033[92mBackend: Function {fc.name} executed. Result: {result}\\033[0m")
                
            except Exception as e:
                print(f"Backend: Error executing function {fc.name}: {e}")
                traceback.print_exc()
                function_response_content = {
                    "status": "error",
                    "message": str(e)
                }
        else:
            print(f"Backend: Function {fc.name} not found.")
            function_response_content = {
                "status": "error",
                "message": f"Function {fc.name} not implemented or available."
            }
        
        # For NON_BLOCKING functions, add scheduling to control when Gemini announces results
        # SILENT: Functions execute in background without interrupting conversation
        # The AI will naturally incorporate results into ongoing conversation flow
        if function_response_content and "status" in function_response_content and function_response_content["status"] == "SUCCESS":
            # Use SILENT scheduling for seamless conversational experience
            # This allows users to continue talking while functions execute in background
            # The AI assistant will naturally use the function results in subsequent responses
            function_response_content["scheduling"] = types.FunctionResponseScheduling.SILENT
        
        return types.FunctionResponse(
            id=fc.id,
            name=fc.name,
            response=function_response_content
        )