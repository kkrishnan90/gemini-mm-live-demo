"""
Handles tool call processing and execution.
Enhanced with callback-based execution for non-blocking function calls.
"""

import asyncio
import traceback
import time
from typing import Dict, Any, Callable, List

from google.genai import types
from app.tools.registry import CallbackBasedFunctionRegistry


class ToolCallProcessor:
    """Processes tool calls from Gemini Live API."""
    
    def __init__(self, session, available_functions: Dict[str, Callable], tool_results_queue: asyncio.Queue):
        self.session = session
        self.available_functions = available_functions
        self.tool_results_queue = tool_results_queue
        
        # Create callback-based registry for enhanced execution
        self.callback_registry = CallbackBasedFunctionRegistry(session, available_functions, self.tool_results_queue)
        
        # Keep original implementation for fallback/compatibility
        self.use_callback_pattern = True  # Enable callback-based execution
    
    async def process_tool_call(self, tool_call):
        """Process tool call from Gemini with NON-BLOCKING execution."""
        start_time = time.time()
        timestamp = time.strftime("%H:%M:%S.%f")[:-3]
        
        print(f"\\033[92m[{timestamp}] 🔥 TOOL_CALL_START: Received tool_call from Gemini: {tool_call}\\033[0m")
        
        if self.use_callback_pattern:
            print(f"\\033[96m[{timestamp}] 🚀 STARTING CALLBACK-BASED function execution...\\033[0m")
            
            # Use callback-based execution pattern (like working repo)
            function_call_ids = []
            for fc in tool_call.function_calls:
                function_name = fc.name
                function_args = dict(fc.args)
                call_id = fc.id if hasattr(fc, 'id') else None
                
                task_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                print(f"\\033[92m[{task_timestamp}] 🔄 CALLBACK_START: Starting callback execution for {function_name}\\033[0m")
                
                # Start function with callback-based completion
                actual_call_id = self.callback_registry.start_function_with_callback(
                    function_name, function_args, call_id
                )
                function_call_ids.append(actual_call_id)
                
                callback_set_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                print(f"\\033[93m[{callback_set_timestamp}] ✅ CALLBACK_SET: Callback set for {function_name} (ID: {actual_call_id})\\033[0m")
            
            end_time = time.time()
            end_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            duration = (end_time - start_time) * 1000
            print(f"\\033[96m[{end_timestamp}] 🎯 CALLBACK_TOOL_CALL_COMPLETE: All {len(function_call_ids)} functions started with callbacks. Duration: {duration:.2f}ms. CONVERSATION CAN CONTINUE NOW!\\033[0m")
        
        else:
            # Fallback to original implementation
            print(f"\\033[96m[{timestamp}] 🚀 STARTING ORIGINAL NON-BLOCKING function execution...\\033[0m")
            await self._process_tool_call_original(tool_call, start_time)
    
    async def _process_tool_call_original(self, tool_call, start_time):
        """Original tool call processing implementation for fallback."""
        # Start all functions in background tasks immediately - DON'T WAIT!
        background_tasks = []
        for fc in tool_call.function_calls:
            task_start_time = time.time()
            task_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            print(f"\\033[92m[{task_timestamp}] 🔄 TASK_CREATE: Creating background task for function: {fc.name} with args: {dict(fc.args)}\\033[0m")
            
            # Create background task that will execute and respond independently
            task = asyncio.create_task(
                self._execute_and_respond_individual(fc, task_start_time),
                name=f"FunctionExecution-{fc.name}-{fc.id}"
            )
            background_tasks.append(task)
            
            created_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            print(f"\\033[93m[{created_timestamp}] ✅ TASK_CREATED: Background task for {fc.name} is now running independently\\033[0m")
        
        # Store tasks for cleanup (optional - they'll complete independently)
        if hasattr(self, '_background_tasks'):
            self._background_tasks.extend(background_tasks)
        else:
            self._background_tasks = background_tasks
        
        end_time = time.time()
        end_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
        duration = (end_time - start_time) * 1000
        print(f"\\033[96m[{end_timestamp}] 🎯 ORIGINAL_TOOL_CALL_COMPLETE: All {len(background_tasks)} functions started in background. Duration: {duration:.2f}ms. CONVERSATION CAN CONTINUE NOW!\\033[0m")
    
    async def _execute_and_respond_individual(self, fc, task_start_time):
        """Execute a single function call and send its response immediately when ready."""
        exec_start_time = time.time()
        exec_start_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
        task_creation_delay = (exec_start_time - task_start_time) * 1000
        
        try:
            print(f"\\033[93m[{exec_start_timestamp}] 🔄 FUNC_EXEC_START: Executing {fc.name} in background (task creation delay: {task_creation_delay:.2f}ms)\\033[0m")
            
            # Execute the function (with delay)
            func_call_start = time.time()
            function_response = await self._execute_function_call(fc)
            func_call_end = time.time()
            func_duration = (func_call_end - func_call_start) * 1000
            
            # Queue individual response instead of sending immediately
            send_start_time = time.time()
            send_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            print(f"\\033[93m[{send_timestamp}] 📤 RESPONSE_QUEUE_START: Queueing response for {fc.name} (function took {func_duration:.2f}ms)\\033[0m")
            
            await self.tool_results_queue.put(function_response)
            
            send_end_time = time.time()
            send_end_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            send_duration = (send_end_time - send_start_time) * 1000
            total_duration = (send_end_time - exec_start_time) * 1000
            
            print(f"\\033[93m[{send_end_timestamp}] ✅ FUNC_COMPLETE: {fc.name} completed and response queued! (queue took {send_duration:.2f}ms, total: {total_duration:.2f}ms)\\033[0m")
            
        except Exception as e:
            error_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            print(f"\\033[91m[{error_timestamp}] ❌ FUNC_ERROR: Error in background execution of {fc.name}: {e}\\033[0m")
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
                await self.tool_results_queue.put(error_response)
                print(f"\\033[91m[{error_timestamp}] ERROR_RESPONSE_QUEUED: Error response queued for {fc.name}\\033[0m")
            except Exception as queue_error:
                print(f"\\033[91m[{error_timestamp}] QUEUE_ERROR: Failed to queue error response: {queue_error}\\033[0m")
    
    async def _execute_function_call(self, fc) -> types.FunctionResponse:
        """Execute a single function call."""
        call_start_time = time.time()
        call_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
        
        function_to_call = self.available_functions.get(fc.name)
        function_response_content = None
        
        if function_to_call:
            try:
                function_args = dict(fc.args)
                print(f"\\033[92m[{call_timestamp}] 🛠️ FUNC_CALL_START: Calling function {fc.name} with args: {function_args}\\033[0m")
                
                # Execute the function
                actual_start = time.time()
                result = await function_to_call(**function_args)
                actual_end = time.time()
                actual_duration = (actual_end - actual_start) * 1000
                
                if isinstance(result, str):
                    function_response_content = {"content": result}
                else:
                    # Assume result is already a dict if not a string
                    function_response_content = result
                
                result_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                print(f"\\033[92m[{result_timestamp}] 🎉 FUNC_CALL_RESULT: Function {fc.name} executed in {actual_duration:.2f}ms. Result: {result}\\033[0m")
                
            except Exception as e:
                error_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                print(f"\\033[91m[{error_timestamp}] ❌ FUNC_CALL_ERROR: Error executing function {fc.name}: {e}\\033[0m")
                traceback.print_exc()
                function_response_content = {
                    "status": "error",
                    "message": str(e)
                }
        else:
            not_found_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            print(f"\\033[91m[{not_found_timestamp}] ❌ FUNC_NOT_FOUND: Function {fc.name} not found.\\033[0m")
            function_response_content = {
                "status": "error",
                "message": f"Function {fc.name} not implemented or available."
            }
        
        response_create_time = time.time()
        response_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
        total_call_duration = (response_create_time - call_start_time) * 1000
        print(f"\\033[94m[{response_timestamp}] 📦 RESPONSE_CREATE: Creating response for {fc.name} (total call duration: {total_call_duration:.2f}ms)\\033[0m")
        
        return types.FunctionResponse(
            id=fc.id,
            name=fc.name,
            response=function_response_content
        )