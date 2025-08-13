"""
Handles tool call processing and execution.
"""

import asyncio
import traceback
from typing import Dict, Any, Callable, List

from google.genai import types


class ToolCallProcessor:
    """Processes tool calls from Gemini Live API."""
    
    def __init__(self, session, available_functions: Dict[str, Callable]):
        self.session = session
        self.available_functions = available_functions
    
    async def process_tool_call(self, tool_call):
        """Process tool call from Gemini with NON-BLOCKING execution."""
        print(f"\\033[92mBackend: Received tool_call from Gemini: {tool_call}\\033[0m")
        print(f"\\033[96mBackend: Starting NON-BLOCKING function execution...\\033[0m")
        
        # Start all functions in background tasks immediately - DON'T WAIT!
        background_tasks = []
        for fc in tool_call.function_calls:
            print(f"\\033[92mBackend: Starting background task for function: {fc.name} with args: {dict(fc.args)}\\033[0m")
            
            # Create background task that will execute and respond independently
            task = asyncio.create_task(
                self._execute_and_respond_individual(fc),
                name=f"FunctionExecution-{fc.name}-{fc.id}"
            )
            background_tasks.append(task)
        
        # Store tasks for cleanup (optional - they'll complete independently)
        if hasattr(self, '_background_tasks'):
            self._background_tasks.extend(background_tasks)
        else:
            self._background_tasks = background_tasks
        
        print(f"\\033[96mBackend: ✅ All {len(background_tasks)} functions started in background. Conversation can continue!\\033[0m")
    
    async def _execute_and_respond_individual(self, fc):
        """Execute a single function call and send its response immediately when ready."""
        try:
            print(f"\\033[93mBackend: 🔄 Executing {fc.name} in background...\\033[0m")
            
            # Execute the function (with 5-second delay)
            function_response = await self._execute_function_call(fc)
            
            # Send individual response immediately when ready
            print(f"\\033[93mBackend: 📤 Sending response for {fc.name} to Gemini...\\033[0m")
            await self.session.send_tool_response(function_responses=[function_response])
            
            print(f"\\033[93mBackend: ✅ {fc.name} completed and response sent!\\033[0m")
            
        except Exception as e:
            print(f"\\033[91mBackend: ❌ Error in background execution of {fc.name}: {e}\\033[0m")
            # Send error response
            error_response = types.FunctionResponse(
                id=fc.id,
                name=fc.name,
                response={
                    "status": "error",
                    "message": f"Background execution failed: {str(e)}"
                }
            )
            try:
                await self.session.send_tool_response(function_responses=[error_response])
            except Exception as send_error:
                print(f"\\033[91mBackend: Failed to send error response: {send_error}\\033[0m")
    
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
        
        # Note: NON_BLOCKING behavior and scheduling are not supported in Vertex AI
        # Functions will execute synchronously with the 5-second delay as requested
        
        return types.FunctionResponse(
            id=fc.id,
            name=fc.name,
            response=function_response_content
        )